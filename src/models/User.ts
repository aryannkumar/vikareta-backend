export interface User {
    id: string;
    email: string;
    password_hash: string;
    first_name: string;
    last_name: string;
    role: 'buyer' | 'supplier' | 'service_provider' | 'admin';
    company_name?: string;
    phone?: string;
    location?: string;
    verified: boolean;
    experience?: string;
    avatar_url?: string;
    created_at: Date;
    updated_at: Date;
}

export interface CreateUserData {
    email: string;
    password_hash: string;
    first_name: string;
    last_name: string;
    role: 'buyer' | 'supplier' | 'service_provider' | 'admin';
    company_name?: string;
    phone?: string;
    location?: string;
    experience?: string;
}