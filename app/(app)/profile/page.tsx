'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { User, Camera, Check, ChevronLeft, Bell, BellOff, Lock } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const GENDER_OPTIONS = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'femenino', label: 'Femenino' },
  { value: 'otro', label: 'Otro' },
]

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth()
  const { error: showError, success } = useToast()
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [gender, setGender] = useState(profile?.gender || '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '')
  const [uploading, setUploading] = useState(false)
  const [avatarLoadError, setAvatarLoadError] = useState(false)

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '')
      setGender(profile.gender || '')
      setAvatarUrl(profile.avatar_url || '')
    }
  }, [profile])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Password change
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `avatars/${user.id}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      setAvatarUrl(data.publicUrl + '?t=' + Date.now())
      setAvatarLoadError(false)
    } catch (err) {
      console.error('Upload error:', err)
      showError('Error al subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setSaved(false)

    try {
      const { error } = await supabase
        .from('users')
        .update({
          full_name: fullName || null,
          gender: (gender as 'masculino' | 'femenino' | 'otro') || null,
          avatar_url: avatarUrl || null,
        })
        .eq('id', user.id)

      if (error) throw error
      setSaved(true)
      success('Perfil guardado')
      await refreshProfile()
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Save error:', err)
      showError('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  // Push notification state
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null)
  const [pushLoading, setPushLoading] = useState(false)

  useEffect(() => {
    // Check if user has push subscription
    if (!user) return
    supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .then(({ data }) => {
        setPushEnabled(data ? data.length > 0 : false)
      })
  }, [user])

  const handleTogglePush = async () => {
    if (!user) return
    setPushLoading(true)
    try {
      if (pushEnabled) {
        // Unsubscribe
        const { unsubscribeFromPush } = await import('@/lib/notifications')
        await unsubscribeFromPush()
        await supabase.from('push_subscriptions').delete().eq('user_id', user.id)
        setPushEnabled(false)
        success('Notificaciones desactivadas')
      } else {
        // Subscribe
        const { subscribeToPush } = await import('@/lib/notifications')
        const ok = await subscribeToPush(user.id)
        if (ok) {
          setPushEnabled(true)
          success('Notificaciones activadas')
        } else {
          showError('No se pudieron activar las notificaciones. Verifica los permisos del navegador.')
        }
      }
    } catch {
      showError('Error al cambiar notificaciones')
    } finally {
      setPushLoading(false)
    }
  }

  const handleChangePassword = async () => {
    if (!user) return
    if (newPassword.length < 6) { showError('La contraseña debe tener al menos 6 caracteres'); return }
    if (newPassword !== confirmPassword) { showError('Las contraseñas no coinciden'); return }

    setPasswordLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) { showError(error.message); setPasswordLoading(false); return }

      success('Contraseña actualizada')
      setShowPasswordChange(false)
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      showError('Error al cambiar la contraseña')
    } finally {
      setPasswordLoading(false)
    }
  }

  const hasChanges =
    fullName !== (profile?.full_name || '') ||
    gender !== (profile?.gender || '') ||
    avatarUrl !== (profile?.avatar_url || '')

  return (
    <div className="animate-fade-in space-y-6">
      {/* Back */}
      <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-white-muted hover:text-white transition-colors">
        <ChevronLeft className="w-4 h-4" />
        Volver
      </Link>

      <h1 className="text-2xl font-bold text-gradient-primary">Mi perfil</h1>

      {/* Avatar */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-white/5 border-2 border-gold/30 flex items-center justify-center overflow-hidden">
            {avatarUrl && !avatarLoadError ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                width={96}
                height={96}
                className="w-full h-full object-cover"
                onError={() => setAvatarLoadError(true)}
              />
            ) : (
              <User className="w-10 h-10 text-white-muted" />
            )}
          </div>
          <label className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-gradient-to-br from-gold to-gold/80 flex items-center justify-center cursor-pointer active:scale-95 transition-transform">
            <Camera className="w-4 h-4 text-white" />
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </div>
        {uploading && <p className="text-xs text-white-muted">Subiendo...</p>}
        <p className="text-xs text-white-muted">{profile?.email}</p>
      </div>

      {/* Name */}
      <div className="card p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-white-muted mb-1.5 block">Nombre completo</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Tu nombre"
            className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>

        {/* Gender */}
        <div>
          <label className="text-xs font-medium text-white-muted mb-2 block">Genero</label>
          <div className="grid grid-cols-3 gap-2">
            {GENDER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setGender(opt.value)}
                className={cn(
                  'px-3 py-2.5 rounded-xl text-sm font-medium text-center border transition-all active:scale-95',
                  gender === opt.value
                    ? 'border-primary bg-primary/20 text-primary shadow-[0_0_8px_rgba(228,30,43,0.15)]'
                    : 'border-black-border bg-transparent text-white hover:border-white/15'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Push Notifications */}
      {pushEnabled !== null && (
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {pushEnabled ? (
                <Bell className="w-5 h-5 text-primary" />
              ) : (
                <BellOff className="w-5 h-5 text-white-muted" />
              )}
              <div>
                <p className="text-sm font-medium text-white">Notificaciones push</p>
                <p className="text-[11px] text-white-muted">Recibe avisos aunque no estes en la app</p>
              </div>
            </div>
            <button
              onClick={handleTogglePush}
              disabled={pushLoading}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors',
                pushEnabled ? 'bg-primary shadow-[0_0_8px_rgba(228,30,43,0.3)]' : 'bg-white/10'
              )}
            >
              <div className={cn(
                'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                pushEnabled && 'translate-x-5'
              )} />
            </button>
          </div>
        </div>
      )}

      {/* Password Change */}
      <div className="card p-5">
        {!showPasswordChange ? (
          <button
            onClick={() => setShowPasswordChange(true)}
            className="flex items-center gap-3 w-full text-left"
          >
            <Lock className="w-5 h-5 text-white-muted" />
            <div>
              <p className="text-sm font-medium text-white">Cambiar contraseña</p>
              <p className="text-[11px] text-white-muted">Actualiza tu contraseña de acceso</p>
            </div>
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-white">Cambiar contraseña</p>
              <button onClick={() => { setShowPasswordChange(false); setNewPassword(''); setConfirmPassword('') }} className="text-xs text-white-muted hover:text-white transition-colors">Cancelar</button>
            </div>
            <input
              type="password"
              placeholder="Nueva contraseña"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
            />
            <input
              type="password"
              placeholder="Confirmar nueva contraseña"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
            />
            <button
              onClick={handleChangePassword}
              disabled={passwordLoading || !newPassword || !confirmPassword}
              className="btn-primary w-full py-2.5 text-sm"
            >
              {passwordLoading ? 'Actualizando...' : 'Actualizar contraseña'}
            </button>
          </div>
        )}
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={!hasChanges || saving}
        className={cn(
          'btn-primary w-full py-3.5 text-base transition-all',
          !hasChanges && 'opacity-40 cursor-not-allowed'
        )}
      >
        {saved ? (
          <><Check className="w-5 h-5" /> Guardado</>
        ) : saving ? (
          'Guardando...'
        ) : (
          'Guardar cambios'
        )}
      </button>

      {/* Legal links */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <Link href="/privacy" className="text-[11px] text-white/30 hover:text-white/60 transition-colors">
          Politica de Privacidad
        </Link>
        <span className="text-white/15">·</span>
        <Link href="/terms" className="text-[11px] text-white/30 hover:text-white/60 transition-colors">
          Terminos de Servicio
        </Link>
      </div>
    </div>
  )
}
