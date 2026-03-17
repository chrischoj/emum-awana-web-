/*
  # Initial Schema for Awana Club Management System

  1. Core Tables
    - users (auth.users is handled by Supabase)
    - teachers
    - members
    - clubs
    - training_schedules

  2. Attendance & Scores
    - teacher_attendance
    - member_attendance
    - handbook_scores
    - game_scores

  3. Inventory & Budget
    - inventory_items
    - budgets
    - orders
    - receipts

  4. Awards & Points
    - awards
    - dalant_transactions
    - memorization_pins

  5. Security
    - RLS policies for each table
    - Role-based access control
*/

-- Create enum types
CREATE TYPE user_role AS ENUM ('admin', 'teacher', 'member');
CREATE TYPE club_type AS ENUM ('sparks', 'tnt');
CREATE TYPE order_status AS ENUM ('pending', 'approved', 'completed', 'cancelled');
CREATE TYPE award_type AS ENUM ('handbook', 'memorization', 'attendance', 'game');

-- Core Tables
CREATE TABLE clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type club_type NOT NULL,
  logo_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE teachers (
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

CREATE TABLE members (
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

CREATE TABLE training_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs,
  training_date date NOT NULL,
  is_holiday boolean DEFAULT false,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Attendance & Scores
CREATE TABLE teacher_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid REFERENCES teachers,
  training_date date NOT NULL,
  present boolean DEFAULT false,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(teacher_id, training_date)
);

CREATE TABLE member_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members,
  training_date date NOT NULL,
  present boolean DEFAULT false,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(member_id, training_date)
);

CREATE TABLE handbook_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members,
  section_number integer NOT NULL,
  score integer NOT NULL,
  completed_at date NOT NULL,
  verified_by uuid REFERENCES teachers,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs,
  training_date date NOT NULL,
  team_name text NOT NULL,
  score integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Inventory & Budget
CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  unit_price decimal(10,2) NOT NULL,
  current_stock integer DEFAULT 0,
  min_stock integer DEFAULT 5,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  amount decimal(10,2) NOT NULL,
  fiscal_year integer NOT NULL,
  remaining decimal(10,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE orders (
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

CREATE TABLE receipts (
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
CREATE TABLE awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members,
  award_type award_type NOT NULL,
  award_date date NOT NULL,
  description text,
  inventory_item_id uuid REFERENCES inventory_items,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE dalant_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members,
  amount integer NOT NULL,
  description text NOT NULL,
  transaction_date date NOT NULL,
  approved_by uuid REFERENCES teachers,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE memorization_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid REFERENCES teachers,
  pin_type text NOT NULL,
  received_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE handbook_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE dalant_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE memorization_pins ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Admins have full access to all tables
CREATE POLICY "Admins have full access" ON clubs
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Teachers can read all club data
CREATE POLICY "Teachers can read clubs" ON clubs
  FOR SELECT USING (auth.jwt() ->> 'role' = 'teacher');

-- Similar policies for other tables...
-- (Additional policies will be added in separate migration files)

-- Create functions for automation
CREATE OR REPLACE FUNCTION calculate_dalant_points()
RETURNS trigger AS $$
BEGIN
  -- Add dalant points based on attendance, handbook scores, etc.
  -- Implementation details will be added later
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;