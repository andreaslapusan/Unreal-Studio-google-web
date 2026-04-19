import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = 'https://rnielxgackkshnatvagj.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaWVseGdhY2trc2huYXR2YWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MzE4NTEsImV4cCI6MjA4NjQwNzg1MX0.5X6k4TVLrH1AJMLw797l4LWTy3cROhh-Q4gAPl-GPJY'

export const supabase = createClient(supabaseUrl, supabaseKey)

export function getImageUrl(path: string): string {
  if (!path || path.startsWith('http')) return path || ''
  const { data } = supabase.storage.from('images').getPublicUrl(path)
  return data.publicUrl
}

export async function uploadImage(file: File, folder: string): Promise<string | null> {
  const fileExt = file.name.split('.').pop()
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`
  const { error } = await supabase.storage.from('images').upload(fileName, file, {
    cacheControl: '3600',
    upsert: false
  })
  if (error) { console.error('Upload error:', error); return null }
  return fileName
}

export async function deleteImage(path: string): Promise<boolean> {
  if (!path || (path.startsWith('http') && !path.includes('supabase'))) return true
  const { error } = await supabase.storage.from('images').remove([path])
  return !error
}

export function parseJsonField<T>(value: any, fallback: T): T {
  if (Array.isArray(value)) return value as T;
  if (typeof value === 'string') {
    try {
      // Intentar parsear si parece un objeto o array JSON
      if (value.trim().startsWith('[') || value.trim().startsWith('{')) {
          const parsed = JSON.parse(value);
          return parsed as T;
      }
    } catch {
      return fallback;
    }
  }
  return fallback;
}