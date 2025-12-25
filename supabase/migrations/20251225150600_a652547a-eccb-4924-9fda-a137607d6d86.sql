-- Create wheel_balance_tasks table for sphere tasks
CREATE TABLE public.wheel_balance_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  sphere_key TEXT NOT NULL,
  content TEXT NOT NULL,
  important BOOLEAN NOT NULL DEFAULT true,
  urgent BOOLEAN NOT NULL DEFAULT false,
  completed BOOLEAN NOT NULL DEFAULT false,
  linked_eisenhower_task_id UUID REFERENCES public.eisenhower_tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.wheel_balance_tasks ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own wheel tasks" 
ON public.wheel_balance_tasks 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own wheel tasks" 
ON public.wheel_balance_tasks 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wheel tasks" 
ON public.wheel_balance_tasks 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wheel tasks" 
ON public.wheel_balance_tasks 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_wheel_balance_tasks_updated_at
BEFORE UPDATE ON public.wheel_balance_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add source tracking columns to eisenhower_tasks
ALTER TABLE public.eisenhower_tasks 
ADD COLUMN source TEXT DEFAULT 'direct',
ADD COLUMN source_task_id UUID REFERENCES public.wheel_balance_tasks(id) ON DELETE CASCADE;