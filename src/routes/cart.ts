import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '@/middleware/auth';
import { logger } from '@/utils/logger';

const router = Router();
const prisma = new PrismaClient();

// Validation middleware
const handleValidationErrors = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: errors.array(),
      },
    });
  }
  return next();
};

// GET /api/cart - Get user's cart
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    let cart = await prisma.shoppingCart.findUnique({
      where: { userId: req.authUser!.userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                media: {
                  take: 1,
                  orderBy: { sortOrder: 'asc' },
                },
                seller: {
                  select: {
                    id: true,
                    businessName: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            variant: true,
          },
        },
      },
    });

    if (!cart) {
      // Create empty cart if it doesn't exist
      cart = await prisma.shoppingCart.create({
        data: {
          userId: req.authUser!.userId,
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  media: {
                    take: 1,
                    orderBy: { sortOrder: 'asc' },
                  },
                  seller: {
                    select: {
                      id: true,
                      businessName: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
              variant: true,
            },
          },
        },
      });
    }

    // Calculate totals
    const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = cart.items.reduce((sum, item) => sum + (Number(item.unitPrice) * item.quantity), 0);

    return res.json({
      success: true,
      data: {
        ...cart,
        totalItems,
        totalAmount,
      },
    });
  } catch (error) {
    logger.error('Error fetching cart:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch cart',
      },
    });
  }
});

// POST /api/cart/items - Add item to cart
router.post('/items', authenticate, [
  body('productId').isUUID().withMessage('Product ID must be a valid UUID'),
  body('variantId').optional().isUUID().withMessage('Variant ID must be a valid UUID'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const { productId, variantId, quantity } = req.body;

    // Check if product exists and is available
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        variants: true,
      },
    });

    if (!product || product.status !== 'active') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product not found or unavailable',
        },
      });
    }

    // Check stock availability
    const availableStock = variantId
      ? product.variants.find(v => v.id === variantId)?.stockQuantity || 0
      : product.stockQuantity;

    if (availableStock < quantity) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: 'Insufficient stock available',
        },
      });
    }

    // Get or create cart
    let cart = await prisma.shoppingCart.findUnique({
      where: { userId: req.authUser!.userId },
    });

    if (!cart) {
      cart = await prisma.shoppingCart.create({
        data: { userId: req.authUser!.userId },
      });
    }

    // Check if item already exists in cart
    const existingItem = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId,
        variantId: variantId || null,
      },
    });

    let cartItem;
    const unitPrice = variantId
      ? Number(product.price) + Number(product.variants.find(v => v.id === variantId)?.priceAdjustment || 0)
      : Number(product.price);

    if (existingItem) {
      // Update existing item
      cartItem = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + quantity,
        },
        include: {
          product: {
            include: {
              media: {
                take: 1,
                orderBy: { sortOrder: 'asc' },
              },
              seller: {
                select: {
                  id: true,
                  businessName: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          variant: true,
        },
      });
    } else {
      // Create new item
      cartItem = await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId,
          variantId,
          quantity,
          unitPrice,
        },
        include: {
          product: {
            include: {
              media: {
                take: 1,
                orderBy: { sortOrder: 'asc' },
              },
              seller: {
                select: {
                  id: true,
                  businessName: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          variant: true,
        },
      });
    }

    logger.info('Item added to cart:', {
      userId: req.authUser!.userId,
      productId,
      quantity
    });

    return res.status(201).json({
      success: true,
      data: cartItem,
      message: 'Item added to cart successfully',
    });
  } catch (error) {
    logger.error('Error adding item to cart:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to add item to cart',
      },
    });
  }
});

// PUT /api/cart/items/:id - Update cart item quantity
router.put('/items/:id', authenticate, [
  param('id').isUUID().withMessage('Item ID must be a valid UUID'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const { quantity } = req.body;

    // Find cart item
    const cartItem = await prisma.cartItem.findFirst({
      where: {
        id: req.params.id,
        cart: { userId: req.authUser!.userId },
      },
      include: {
        product: true,
        variant: true,
      },
    });

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ITEM_NOT_FOUND',
          message: 'Cart item not found',
        },
      });
    }

    // Check stock availability
    const availableStock = cartItem.variant?.stockQuantity || cartItem.product.stockQuantity;
    if (availableStock < quantity) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: 'Insufficient stock available',
        },
      });
    }

    // Update cart item
    const updatedItem = await prisma.cartItem.update({
      where: { id: req.params.id },
      data: {
        quantity,
      },
      include: {
        product: {
          include: {
            media: {
              take: 1,
              orderBy: { sortOrder: 'asc' },
            },
            seller: {
              select: {
                id: true,
                businessName: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        variant: true,
      },
    });

    return res.json({
      success: true,
      data: updatedItem,
      message: 'Cart item updated successfully',
    });
  } catch (error) {
    logger.error('Error updating cart item:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update cart item',
      },
    });
  }
});

// DELETE /api/cart/items/:id - Remove item from cart
router.delete('/items/:id', authenticate, [
  param('id').isUUID().withMessage('Item ID must be a valid UUID'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    // Check if item exists and belongs to user
    const cartItem = await prisma.cartItem.findFirst({
      where: {
        id: req.params.id,
        cart: { userId: req.authUser!.userId },
      },
    });

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ITEM_NOT_FOUND',
          message: 'Cart item not found',
        },
      });
    }

    await prisma.cartItem.delete({
      where: { id: req.params.id },
    });

    return res.json({
      success: true,
      message: 'Item removed from cart successfully',
    });
  } catch (error) {
    logger.error('Error removing cart item:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to remove cart item',
      },
    });
  }
});

// DELETE /api/cart - Clear entire cart
router.delete('/', authenticate, async (req: Request, res: Response) => {
  try {
    const cart = await prisma.shoppingCart.findUnique({
      where: { userId: req.authUser!.userId },
    });

    if (cart) {
      await prisma.cartItem.deleteMany({
        where: { cartId: cart.id },
      });
    }

    return res.json({
      success: true,
      message: 'Cart cleared successfully',
    });
  } catch (error) {
    logger.error('Error clearing cart:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to clear cart',
      },
    });
  }
});

// POST /api/cart/sync - Sync cart with server
router.post('/sync', authenticate, [
  body('items').isArray().withMessage('Items must be an array'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const { items } = req.body;

    // Get or create cart
    let cart = await prisma.shoppingCart.findUnique({
      where: { userId: req.authUser!.userId },
    });

    if (!cart) {
      cart = await prisma.shoppingCart.create({
        data: { userId: req.authUser!.userId },
      });
    }

    // Clear existing items
    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    // Add new items
    if (items.length > 0) {
      await prisma.cartItem.createMany({
        data: items.map((item: any) => ({
          cartId: cart.id,
          productId: item.productId,
          variantId: item.variantId || null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      });
    }

    return res.json({
      success: true,
      message: 'Cart synced successfully',
    });
  } catch (error) {
    logger.error('Error syncing cart:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to sync cart',
      },
    });
  }
});

export default router;