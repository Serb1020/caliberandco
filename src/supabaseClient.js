import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// -------------------------------------------------------
// AUTH HELPERS
// -------------------------------------------------------
export const auth = {
  signUp: (email, password) => supabase.auth.signUp({ email, password }),
  signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
  signOut: () => supabase.auth.signOut(),
  getUser: () => supabase.auth.getUser(),
  onAuthChange: (cb) => supabase.auth.onAuthStateChange(cb),
}

// -------------------------------------------------------
// LISTINGS
// -------------------------------------------------------
export const listings = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  getById: async (id) => {
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  getByUser: async (userEmail) => {
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('created_by', userEmail)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  create: async (listing) => {
    const { data, error } = await supabase
      .from('listings')
      .insert([listing])
      .select()
      .single()
    if (error) throw error
    return data
  },

  update: async (id, updates) => {
    const { data, error } = await supabase
      .from('listings')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  uploadImage: async (file, listingId) => {
    const ext = file.name.split('.').pop()
    const path = `${listingId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('listing-images')
      .upload(path, file)
    if (error) throw error
    const { data } = supabase.storage
      .from('listing-images')
      .getPublicUrl(path)
    return data.publicUrl
  },
}

// -------------------------------------------------------
// BIDS
// -------------------------------------------------------
export const bids = {
  getByListing: async (listingId) => {
    const { data, error } = await supabase
      .from('bids')
      .select('*')
      .eq('listing_id', listingId)
      .order('repair_price', { ascending: true })
    if (error) throw error
    return data
  },

  getAll: async () => {
    const { data, error } = await supabase
      .from('bids')
      .select('*')
    if (error) throw error
    return data
  },

  getByRepairman: async (email) => {
    const { data, error } = await supabase
      .from('bids')
      .select('*')
      .eq('repairman_email', email)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  create: async (bid) => {
    const { data, error } = await supabase
      .from('bids')
      .insert([bid])
      .select()
      .single()
    if (error) throw error
    return data
  },

  update: async (id, updates) => {
    const { data, error } = await supabase
      .from('bids')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}

// -------------------------------------------------------
// REVIEWS
// -------------------------------------------------------
export const reviews = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
    if (error) throw error
    return data
  },

  getByRepairman: async (email) => {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('repairman_email', email)
    if (error) throw error
    return data
  },

  create: async (review) => {
    const { data, error } = await supabase
      .from('reviews')
      .insert([review])
      .select()
      .single()
    if (error) throw error
    return data
  },
}

// -------------------------------------------------------
// RESALE
// -------------------------------------------------------
export const resale = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('resale_listings')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  create: async (item) => {
    const { data, error } = await supabase
      .from('resale_listings')
      .insert([item])
      .select()
      .single()
    if (error) throw error
    return data
  },

  update: async (id, updates) => {
    const { data, error } = await supabase
      .from('resale_listings')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}

// -------------------------------------------------------
// PROFILES
// -------------------------------------------------------
export const profiles = {
  get: async (email) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single()
    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  upsert: async (profile) => {
    const { data, error } = await supabase
      .from('profiles')
      .upsert([profile], { onConflict: 'email' })
      .select()
      .single()
    if (error) throw error
    return data
  },
}
