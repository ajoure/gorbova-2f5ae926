-- Create table for saved iLex documents
CREATE TABLE public.ilex_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ilex_id TEXT NOT NULL,
  title TEXT NOT NULL,
  doc_type TEXT,
  doc_date DATE,
  doc_number TEXT,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  saved_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ilex_documents ENABLE ROW LEVEL SECURITY;

-- Index for fast lookup
CREATE INDEX idx_ilex_documents_ilex_id ON public.ilex_documents(ilex_id);
CREATE INDEX idx_ilex_documents_saved_by ON public.ilex_documents(saved_by);

-- RLS policies
CREATE POLICY "Authenticated users can read all ilex documents"
  ON public.ilex_documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own ilex documents"
  ON public.ilex_documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = saved_by);

CREATE POLICY "Users can update their own ilex documents"
  ON public.ilex_documents FOR UPDATE
  TO authenticated
  USING (auth.uid() = saved_by);

CREATE POLICY "Users can delete their own ilex documents"
  ON public.ilex_documents FOR DELETE
  TO authenticated
  USING (auth.uid() = saved_by);

-- Trigger for updated_at
CREATE TRIGGER update_ilex_documents_updated_at
  BEFORE UPDATE ON public.ilex_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create table for iLex settings (credentials stored in secrets, but connection status here)
CREATE TABLE public.ilex_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  last_connection_check TIMESTAMPTZ,
  connection_status TEXT DEFAULT 'unknown',
  session_cookie TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID
);

-- Enable RLS
ALTER TABLE public.ilex_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can access settings
CREATE POLICY "Admins can manage ilex settings"
  ON public.ilex_settings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert default row
INSERT INTO public.ilex_settings (id, connection_status) 
VALUES ('00000000-0000-0000-0000-000000000001', 'unknown');