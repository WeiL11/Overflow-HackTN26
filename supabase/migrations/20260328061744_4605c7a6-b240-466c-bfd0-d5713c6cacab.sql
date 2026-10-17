-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('donor', 'receiver')) DEFAULT 'donor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Create food_listings table
CREATE TABLE public.food_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  quantity TEXT NOT NULL,
  location TEXT NOT NULL,
  expiry_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'requested', 'completed')) DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.food_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view available food" ON public.food_listings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Donors can insert own listings" ON public.food_listings FOR INSERT WITH CHECK (auth.uid() = donor_id);
CREATE POLICY "Donors can update own listings" ON public.food_listings FOR UPDATE USING (auth.uid() = donor_id);
CREATE POLICY "Donors can delete own listings" ON public.food_listings FOR DELETE USING (auth.uid() = donor_id);

-- Create food_requests table
CREATE TABLE public.food_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.food_listings(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(listing_id, receiver_id)
);

ALTER TABLE public.food_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Receivers can view own requests" ON public.food_requests FOR SELECT USING (auth.uid() = receiver_id);
CREATE POLICY "Donors can view requests for their listings" ON public.food_requests FOR SELECT USING (
  auth.uid() IN (SELECT donor_id FROM public.food_listings WHERE id = listing_id)
);
CREATE POLICY "Receivers can insert requests" ON public.food_requests FOR INSERT WITH CHECK (auth.uid() = receiver_id);
CREATE POLICY "Donors can update request status" ON public.food_requests FOR UPDATE USING (
  auth.uid() IN (SELECT donor_id FROM public.food_listings WHERE id = listing_id)
);

-- Trigger for auto-creating profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'role', 'donor'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();