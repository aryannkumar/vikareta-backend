-- PostgreSQL initialization script for Vikareta
-- This script runs when the database is first created

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create additional databases if needed
-- CREATE DATABASE vikareta_test;

-- Set default timezone
SET timezone = 'UTC';

-- Create indexes for better performance (these will be created by Prisma migrations)
-- This file is mainly for extensions and initial setup