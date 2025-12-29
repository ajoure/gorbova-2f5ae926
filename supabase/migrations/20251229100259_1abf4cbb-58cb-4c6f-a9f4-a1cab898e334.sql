-- Create products table for selling
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_byn INTEGER NOT NULL, -- Price in kopecks (100 = 1 BYN)
  currency TEXT NOT NULL DEFAULT 'BYN',
  product_type TEXT NOT NULL DEFAULT 'subscription', -- subscription, one_time, webinar
  duration_days INTEGER, -- For subscriptions: how many days access
  tier TEXT, -- Maps to subscription_tier if applicable
  is_active BOOLEAN NOT NULL DEFAULT true,
  meta JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create orders table to track payments
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id UUID REFERENCES public.products(id),
  amount INTEGER NOT NULL, -- Amount in minimal units
  currency TEXT NOT NULL DEFAULT 'BYN',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, refunded
  bepaid_token TEXT,
  bepaid_uid TEXT, -- Transaction UID from bePaid
  payment_method TEXT,
  customer_email TEXT,
  customer_ip TEXT,
  error_message TEXT,
  meta JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create payment settings table for admin
CREATE TABLE public.payment_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

-- Products: public can view active products, admins can manage
CREATE POLICY "Anyone can view active products"
ON public.products FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage products"
ON public.products FOR ALL
USING (has_permission(auth.uid(), 'entitlements.manage'))
WITH CHECK (has_permission(auth.uid(), 'entitlements.manage'));

-- Orders: users can view their own orders, admins can view all
CREATE POLICY "Users can view their own orders"
ON public.orders FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all orders"
ON public.orders FOR SELECT
USING (has_permission(auth.uid(), 'users.view'));

CREATE POLICY "Anyone can create orders"
ON public.orders FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service can update orders"
ON public.orders FOR UPDATE
USING (true);

-- Payment settings: only admins
CREATE POLICY "Admins can manage payment settings"
ON public.payment_settings FOR ALL
USING (has_permission(auth.uid(), 'entitlements.manage'))
WITH CHECK (has_permission(auth.uid(), 'entitlements.manage'));

-- Insert default payment settings
INSERT INTO public.payment_settings (key, value, description) VALUES
('bepaid_shop_id', '14588', 'bePaid Shop ID'),
('bepaid_test_mode', 'false', 'Test mode for bePaid'),
('bepaid_success_url', '/dashboard?payment=success', 'Redirect URL after successful payment'),
('bepaid_fail_url', '/pricing?payment=failed', 'Redirect URL after failed payment'),
('bepaid_notification_url', '', 'Webhook URL for payment notifications');

-- Triggers for updated_at
CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payment_settings_updated_at
BEFORE UPDATE ON public.payment_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();