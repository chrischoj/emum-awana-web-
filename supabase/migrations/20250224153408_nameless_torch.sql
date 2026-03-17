/*
  # Initial Schema Setup for Awana Club Management System

  1. Core Schema
    - Create enum types for roles, clubs, orders, and awards
    - Set up core tables for clubs, teachers, and members
    - Establish attendance and scoring system tables
    - Create inventory and budget management tables
    - Set up awards and points system

  2. Security
    - Enable RLS on all tables
    - Add basic policies for admin and teacher access
*/

-- Create enum types first
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'teacher', 'member');
    CREATE TYPE club_type AS ENUM ('sparks', 'tnt');
    CREATE TYPE order_status AS ENUM ('pending', 'approved', 'completed', 'cancelled');
    CREATE TYPE award_type AS ENUM ('handbook', 'memorization', 'attendance', 'game');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Core Tables
CREATE TABLE IF NOT EXISTS clubs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type club_type NOT NULL,
    logo_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teachers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users,
    club_id uuid REFERENCES clubs,
    name text NOT NULL,
    phone text,
    role user_role DEFAULT 'teacher',
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid REFERENCES clubs,
    name text NOT NULL,
    birthday date,
    parent_name text,
    parent_phone text,
    uniform_size text,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Attendance & Scores
CREATE TABLE IF NOT EXISTS training_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid REFERENCES clubs,
    training_date date NOT NULL,
    is_holiday boolean DEFAULT false,
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teacher_attendance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id uuid REFERENCES teachers,
    training_date date NOT NULL,
    present boolean DEFAULT false,
    note text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(teacher_id, training_date)
);

CREATE TABLE IF NOT EXISTS member_attendance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid REFERENCES members,
    training_date date NOT NULL,
    present boolean DEFAULT false,
    note text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(member_id, training_date)
);

CREATE TABLE IF NOT EXISTS handbook_scores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid REFERENCES members,
    section_number integer NOT NULL,
    score integer NOT NULL,
    completed_at date NOT NULL,
    verified_by uuid REFERENCES teachers,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_scores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid REFERENCES clubs,
    training_date date NOT NULL,
    team_name text NOT NULL,
    score integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Inventory & Budget
CREATE TABLE IF NOT EXISTS inventory_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    category text NOT NULL,
    unit_price decimal(10,2) NOT NULL,
    current_stock integer DEFAULT 0,
    min_stock integer DEFAULT 5,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budgets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category text NOT NULL,
    amount decimal(10,2) NOT NULL,
    fiscal_year integer NOT NULL,
    remaining decimal(10,2) NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id uuid REFERENCES inventory_items,
    quantity integer NOT NULL,
    total_price decimal(10,2) NOT NULL,
    status order_status DEFAULT 'pending',
    requested_by uuid REFERENCES teachers,
    approved_by uuid REFERENCES teachers,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES orders,
    receipt_date date NOT NULL,
    payment_method text NOT NULL,
    receipt_number text UNIQUE,
    file_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Awards & Points
CREATE TABLE IF NOT EXISTS awards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid REFERENCES members,
    award_type award_type NOT NULL,
    award_date date NOT NULL,
    description text,
    inventory_item_id uuid REFERENCES inventory_items,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dalant_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid REFERENCES members,
    amount integer NOT NULL,
    description text NOT NULL,
    transaction_date date NOT NULL,
    approved_by uuid REFERENCES teachers,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memorization_pins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id uuid REFERENCES teachers,
    pin_type text NOT NULL,
    received_date date NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Enable RLS and create basic policies
DO $$ 
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('auth', 'pg_stat_statements')
    LOOP
        -- Enable RLS
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
        
        -- Drop existing policies if they exist
        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS "Admins have full access" ON %I;', t);
            EXECUTE format('DROP POLICY IF EXISTS "Teachers can read" ON %I;', t);
        EXCEPTION WHEN OTHERS THEN
            -- Ignore any errors when dropping policies
            NULL;
        END;
        
        -- Create new policies
        EXECUTE format(
            'CREATE POLICY "Admins have full access" ON %I
            FOR ALL
            USING (auth.jwt() ->> ''role'' = ''admin'');',
            t
        );
        
        EXECUTE format(
            'CREATE POLICY "Teachers can read" ON %I
            FOR SELECT
            USING (auth.jwt() ->> ''role'' = ''teacher'');',
            t
        );
    END LOOP;
END $$;