import { loadStripe } from '@stripe/stripe-js'

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

let stripePromise
export const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(stripePublishableKey)
  }
  return stripePromise
}

// -------------------------------------------------------
// Create a Stripe Checkout session
// NOTE: In production this call goes to YOUR backend/
// Supabase Edge Function — never expose secret keys
// in the frontend. This is a placeholder that shows
// the correct shape. See STRIPE_SETUP.md for full guide.
// -------------------------------------------------------
export const createCheckoutSession = async ({ bid, listing, customerEmail }) => {
  // For now this opens a Stripe Payment Link.
  // Replace this URL with your actual Stripe Payment Link
  // from stripe.com > Payment Links > Create
  const PAYMENT_LINK = 'https://buy.stripe.com/YOUR_PAYMENT_LINK'
  
  const url = new URL(PAYMENT_LINK)
  url.searchParams.set('prefilled_email', customerEmail)
  url.searchParams.set('client_reference_id', `${listing.id}_${bid.id}`)
  
  window.open(url.toString(), '_blank')
}
