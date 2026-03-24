import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mtjqsjpgwiaacybyklkt.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10anFzanBnd2lhYWN5YnlrbGt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDU5ODUsImV4cCI6MjA4OTA4MTk4NX0.qrSQFn6-AtSbQeEWu_XUJtRKd_6G0tLy57VhbQAvq2c'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
