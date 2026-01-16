-- Function to generate ticket number
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  seq_part INTEGER;
BEGIN
  year_part := to_char(now(), 'YY');
  
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(ticket_number, '^TKT-' || year_part || '-', ''), '')::INTEGER
  ), 0) + 1
  INTO seq_part
  FROM public.support_tickets
  WHERE ticket_number LIKE 'TKT-' || year_part || '-%';
  
  RETURN 'TKT-' || year_part || '-' || LPAD(seq_part::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Table: support_tickets
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE DEFAULT public.generate_ticket_number(),
  
  -- Relations
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Content
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  
  -- Status
  status TEXT NOT NULL DEFAULT 'open' 
    CHECK (status IN ('open', 'in_progress', 'waiting_user', 'resolved', 'closed')),
  priority TEXT DEFAULT 'normal' 
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  -- Flags
  has_unread_user BOOLEAN DEFAULT false,
  has_unread_admin BOOLEAN DEFAULT true,
  is_starred BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

-- Indexes for support_tickets
CREATE INDEX idx_support_tickets_profile ON public.support_tickets(profile_id);
CREATE INDEX idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_support_tickets_assigned ON public.support_tickets(assigned_to);
CREATE INDEX idx_support_tickets_created ON public.support_tickets(created_at DESC);
CREATE INDEX idx_support_tickets_unread_user ON public.support_tickets(has_unread_user) WHERE has_unread_user = true;
CREATE INDEX idx_support_tickets_unread_admin ON public.support_tickets(has_unread_admin) WHERE has_unread_admin = true;

-- Table: ticket_messages
CREATE TABLE public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  
  -- Author
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_type TEXT NOT NULL CHECK (author_type IN ('user', 'support', 'system')),
  author_name TEXT,
  
  -- Content
  message TEXT NOT NULL,
  
  -- Attachments (array of URLs from storage)
  attachments JSONB DEFAULT '[]',
  
  -- Metadata
  is_internal BOOLEAN DEFAULT false,
  is_read BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for ticket_messages
CREATE INDEX idx_ticket_messages_ticket ON public.ticket_messages(ticket_id);
CREATE INDEX idx_ticket_messages_created ON public.ticket_messages(created_at);
CREATE INDEX idx_ticket_messages_author ON public.ticket_messages(author_id);

-- Table: ticket_attachments
CREATE TABLE public.ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.ticket_messages(id) ON DELETE CASCADE,
  
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for ticket_attachments
CREATE INDEX idx_ticket_attachments_ticket ON public.ticket_attachments(ticket_id);
CREATE INDEX idx_ticket_attachments_message ON public.ticket_attachments(message_id);

-- Trigger to update updated_at
CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for support_tickets

-- Users can view their own tickets
CREATE POLICY "Users can view own tickets" ON public.support_tickets
  FOR SELECT USING (user_id = auth.uid());

-- Users can create tickets
CREATE POLICY "Users can create tickets" ON public.support_tickets
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own tickets (limited fields via application logic)
CREATE POLICY "Users can update own tickets" ON public.support_tickets
  FOR UPDATE USING (user_id = auth.uid());

-- Admins/support can view all tickets
CREATE POLICY "Support can view all tickets" ON public.support_tickets
  FOR SELECT USING (
    public.has_permission(auth.uid(), 'support.view') OR
    public.has_permission(auth.uid(), 'admins.manage')
  );

-- Admins/support can update all tickets
CREATE POLICY "Support can update all tickets" ON public.support_tickets
  FOR UPDATE USING (
    public.has_permission(auth.uid(), 'support.manage') OR
    public.has_permission(auth.uid(), 'admins.manage')
  );

-- RLS Policies for ticket_messages

-- Users can view messages in their own tickets
CREATE POLICY "Users can view own ticket messages" ON public.ticket_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets 
      WHERE id = ticket_id AND user_id = auth.uid()
    ) AND is_internal = false
  );

-- Users can create messages in their own tickets
CREATE POLICY "Users can create messages in own tickets" ON public.ticket_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_tickets 
      WHERE id = ticket_id AND user_id = auth.uid()
    ) AND author_type = 'user'
  );

-- Admins/support can view all messages
CREATE POLICY "Support can view all messages" ON public.ticket_messages
  FOR SELECT USING (
    public.has_permission(auth.uid(), 'support.view') OR
    public.has_permission(auth.uid(), 'admins.manage')
  );

-- Admins/support can create messages
CREATE POLICY "Support can create messages" ON public.ticket_messages
  FOR INSERT WITH CHECK (
    public.has_permission(auth.uid(), 'support.manage') OR
    public.has_permission(auth.uid(), 'admins.manage')
  );

-- RLS Policies for ticket_attachments

-- Users can view attachments in their own tickets
CREATE POLICY "Users can view own ticket attachments" ON public.ticket_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets 
      WHERE id = ticket_id AND user_id = auth.uid()
    )
  );

-- Users can upload attachments to their own tickets
CREATE POLICY "Users can upload attachments to own tickets" ON public.ticket_attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_tickets 
      WHERE id = ticket_id AND user_id = auth.uid()
    )
  );

-- Admins/support can view all attachments
CREATE POLICY "Support can view all attachments" ON public.ticket_attachments
  FOR SELECT USING (
    public.has_permission(auth.uid(), 'support.view') OR
    public.has_permission(auth.uid(), 'admins.manage')
  );

-- Admins/support can upload attachments
CREATE POLICY "Support can upload attachments" ON public.ticket_attachments
  FOR INSERT WITH CHECK (
    public.has_permission(auth.uid(), 'support.manage') OR
    public.has_permission(auth.uid(), 'admins.manage')
  );

-- Create storage bucket for ticket attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-attachments', 
  'ticket-attachments', 
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
) ON CONFLICT (id) DO NOTHING;

-- Storage policies for ticket-attachments bucket

-- Users can view attachments in their own tickets
CREATE POLICY "Users can view own ticket attachments storage" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'ticket-attachments' AND
    EXISTS (
      SELECT 1 FROM public.support_tickets 
      WHERE id::text = (storage.foldername(name))[1]
      AND user_id = auth.uid()
    )
  );

-- Users can upload to their own tickets
CREATE POLICY "Users can upload to own tickets storage" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'ticket-attachments' AND
    EXISTS (
      SELECT 1 FROM public.support_tickets 
      WHERE id::text = (storage.foldername(name))[1]
      AND user_id = auth.uid()
    )
  );

-- Admins/support can view all attachments
CREATE POLICY "Support can view all ticket attachments storage" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'ticket-attachments' AND
    (
      public.has_permission(auth.uid(), 'support.view') OR
      public.has_permission(auth.uid(), 'admins.manage')
    )
  );

-- Admins/support can upload attachments
CREATE POLICY "Support can upload ticket attachments storage" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'ticket-attachments' AND
    (
      public.has_permission(auth.uid(), 'support.manage') OR
      public.has_permission(auth.uid(), 'admins.manage')
    )
  );

-- Enable realtime for tickets and messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;

-- Add support permissions if they don't exist
INSERT INTO public.permissions (code, name, category) VALUES
  ('support.view', 'Просмотр обращений', 'support'),
  ('support.manage', 'Управление обращениями', 'support')
ON CONFLICT (code) DO NOTHING;