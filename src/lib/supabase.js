import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kidgcrqxrfcbsaeguwop.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpZGdjcnF4cmZjYnNhZWd1d29wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzY5MzQsImV4cCI6MjA3NDIxMjkzNH0.7u__bKIRGD7xt3JcoME2CBjIF7dGdkqE24IQ26hCe3k'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
