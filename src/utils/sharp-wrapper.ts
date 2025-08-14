/**
 * Jimp Image Processing Service
 * Pure JavaScript image processing without native dependencies
 */

import Jimp from 'jimp';
import { logger } from './logger';

export interface ImageProcessingOptions {
  resize?: {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    quality?: number;
  };
  format?: 'jpeg' | 'png' | 'webp';
  quality?: number;
}

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Process image with Jimp
 */
export async function processImage(
  buffer: Buffer,
  options: ImageProcessingOptions = {}
): Promise<ProcessedImage> {
  try {
    const image = await Jimp.read(buffer);
    const { format = 'jpeg', quality = 85 } = options;

    // Apply resize if specified
    if (options.resize) {
      const { width, height, fit = 'inside' } = options.resize;
      
      if (width && height) {
        switch (fit) {
          case 'cover':
            image.cover(width, height);
            break;
          case 'contain':
            image.contain(width, height);
            break;
          case 'fill':
            image.resize(width, height);
            break;
          case 'inside':
          default:
            // Resize maintaining aspect ratio, fitting inside dimensions
            image.scaleToFit(width, height);
            break;
        }
      } else if (width) {
        image.resize(width, Jimp.AUTO);
      } else if (height) {
        image.resize(Jimp.AUTO, height);
      }
    }

    // Apply quality
    if (quality && quality !== 85) {
      image.quality(quality);
    }

    // Get processed buffer based on format
    let processedBuffer: Buffer;
    switch (format) {
      case 'png':
        processedBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
        break;
      case 'webp':
        // Jimp doesn't support WebP natively, fallback to JPEG
        logger.warn('WebP format not supported by Jimp, using JPEG instead');
        processedBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
        break;
      case 'jpeg':
      default:
        processedBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
        break;
    }

    return {
      buffer: processedBuffer,
      width: image.getWidth(),
      height: image.getHeight(),
    };
  } catch (error) {
    logger.error('Image processing failed:', error);
    // Return original buffer on error
    return {
      buffer,
      width: 0,
      height: 0,
    };
  }
}

/**
 * Create thumbnail using Jimp
 */
export async function createThumbnail(
  buffer: Buffer,
  width: number = 300,
  height: number = 300
): Promise<Buffer> {
  try {
    const image = await Jimp.read(buffer);
    
    // Create thumbnail maintaining aspect ratio
    image.scaleToFit(width, height);
    image.quality(70);
    
    return await image.getBufferAsync(Jimp.MIME_JPEG);
  } catch (error) {
    logger.error('Thumbnail creation failed:', error);
    return buffer;
  }
}

/**
 * Get image metadata using Jimp
 */
export async function getImageMetadata(buffer: Buffer): Promise<{
  width?: number;
  height?: number;
  format?: string;
  size?: number;
}> {
  try {
    const image = await Jimp.read(buffer);
    
    return {
      width: image.getWidth(),
      height: image.getHeight(),
      format: image.getMIME(),
      size: buffer.length,
    };
  } catch (error) {
    logger.error('Failed to get image metadata:', error);
    return {
      width: 0,
      height: 0,
      format: 'unknown',
      size: buffer.length,
    };
  }
}

/**
 * Check if image processing is available (always true for Jimp)
 */
export function isImageProcessingAvailable(): boolean {
  return true;
}

export default {
  processImage,
  createThumbnail,
  getImageMetadata,
  isImageProcessingAvailable,
};