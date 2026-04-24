'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { User, Camera, Check, ChevronLeft, Bell, BellOff, Lock, Trash2, AlertTriangle, Pencil, Mail, Loader2 } from 'lucide-react'
import { authFetch } from '@/lib/auth-fetch'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const GENDER_OPTIONS = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'femenino', label: 'Femenino' },
  { value: 'otro', label: 'Otro' },
]

export default function ProfilePage() {
  const { user, profile, refreshProfile, isAdmin } = useAuth()
  const { error: showError, success } = useToast()
  const backHref = isAdmin ? '/admin/dashboard' : '/home'
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [gender, setGender] = useState(profile?.gender || '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '')
  const [uploading, setUploading] = useState(false)
  const [avatarLoadError, setAvatarLoadError] = useState(false)

  // Email editing
  const [editingEmail, setEditingEmail] = useState(false)
  const [emailValue, setEmailValue] = useState(profile?.email || '')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailSaved, setEmailSaved] = useState(false)

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '')
      setGender(profile.gender || '')
      setAvatarUrl(profile.avatar_url || '')
      setEmailValue(profile.email || '')
    }
  }, [profile])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Password change
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

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

  const handleUpdateEmail = async () => {
    if (!user) return
    const trimmed = emailValue.trim().toLowerCase()
    if (!trimmed || trimmed === profile?.email) {
      setEditingEmail(false)
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      showError('Formato de email invalido')
      return
    }
    setEmailLoading(true)
    try {
      const res = await authFetch('/api/user/update-email', { email: trimmed })
      const data = await res.json()
      if (!res.ok) {
        showError(data.error || 'Error al actualizar el email')
        return
      }
      setEditingEmail(false)
      setEmailSaved(true)
      if (data.ticketSent) {
        success('Email actualizado — entrada reenviada')
      } else {
        success('Email actualizado')
      }
      await refreshProfile()
      setTimeout(() => setEmailSaved(false), 3000)
    } catch (err) {
      console.error('Email update error:', err)
      showError('Error al actualizar el email')
    } finally {
      setEmailLoading(false)
    }
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setSaved(false)

    try {
      const res = await authFetch('/api/user/save-profile', {
        full_name: fullName,
        gender: gender || null,
        avatar_url: avatarUrl || null,
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        showError(data?.error || 'Error al guardar')
        return
      }

      setSaved(true)
      success('Perfil guardado')
      await refreshProfile()
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Save error:', err)
      showError(err instanceof Error ? err.message : 'Error al guardar')
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

  const handleDeleteAccount = async () => {
    if (!user) return
    if (deleteConfirmText.trim().toUpperCase() !== 'ELIMINAR') {
      showError('Escribe ELIMINAR para confirmar')
      return
    }

    setDeleteLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        showError('Sesion no valida, inicia sesion de nuevo')
        setDeleteLoading(false)
        return
      }

      const res = await fetch('/api/user/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()

      if (!res.ok) {
        showError(data.error || 'Error al eliminar la cuenta')
        setDeleteLoading(false)
        return
      }

      success('Cuenta eliminada. Hasta pronto.')
      // Clear local session and redirect to login
      await supabase.auth.signOut()
      setTimeout(() => { window.location.href = '/login' }, 800)
    } catch {
      showError('Error al eliminar la cuenta')
      setDeleteLoading(false)
    }
  }

  const hasChanges =
    fullName !== (profile?.full_name || '') ||
    gender !== (profile?.gender || '') ||
    avatarUrl !== (profile?.avatar_url || '')

  return (
    <div className="animate-fade-in space-y-5">
      {/* Back + Title */}
      <div className="space-y-2">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-white-muted hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Volver
        </Link>
        <h1 className="text-2xl font-bold text-gradient-primary">Mi perfil</h1>
      </div>

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

        {/* Editable email */}
        {editingEmail ? (
          <div className="flex items-center gap-2 w-full max-w-[300px]">
            <input
              type="email"
              value={emailValue}
              onChange={(e) => setEmailValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateEmail(); if (e.key === 'Escape') { setEditingEmail(false); setEmailValue(profile?.email || '') } }}
              autoFocus
              className="flex-1 px-3 py-1.5 rounded-lg border border-primary/40 bg-transparent text-white text-xs text-center focus:outline-none focus:border-primary transition-colors"
              disabled={emailLoading}
            />
            <button
              onClick={handleUpdateEmail}
              disabled={emailLoading}
              className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
            >
              {emailLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => { setEditingEmail(false); setEmailValue(profile?.email || '') }}
              disabled={emailLoading}
              className="p-1.5 rounded-lg text-white-muted hover:text-white hover:bg-white/5 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5 rotate-[270deg]" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingEmail(true)}
            className={cn(
              'flex items-center gap-1.5 group transition-colors',
              emailSaved ? 'text-emerald-400' : 'text-white-muted'
            )}
          >
            <Mail className="w-3 h-3" />
            <span className="text-xs">{emailSaved ? 'Email actualizado!' : profile?.email}</span>
            {!emailSaved && <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />}
          </button>
        )}
      </div>

      {/* Name */}
      <div className="card p-5 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-white-muted">Nombre completo</label>
            {profile?.full_name_locked && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400/80">
                <Lock className="w-2.5 h-2.5" />
                Bloqueado
              </span>
            )}
          </div>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={!!profile?.full_name_locked}
            placeholder="Nombre y apellido"
            className={cn(
              'w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors',
              profile?.full_name_locked && 'opacity-60 cursor-not-allowed'
            )}
          />
          <p className="text-[11px] text-white-muted mt-1.5 leading-relaxed">
            {profile?.full_name_locked
              ? 'Tu nombre esta bloqueado. Contacta con un organizador si necesitas corregirlo.'
              : 'Escribe nombre y apellido reales (minimo 2 palabras). Se usara en el chat y no se podra cambiar despues.'}
          </p>
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

      {/* Delete account — danger zone */}
      <div className="card p-5 border-red-500/20 bg-red-500/[0.02]">
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-3 w-full text-left"
          >
            <Trash2 className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-sm font-medium text-red-400">Eliminar cuenta</p>
              <p className="text-[11px] text-white-muted">Borra tu cuenta y todos tus datos de forma permanente</p>
            </div>
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-400 mb-1">Accion irreversible</p>
                <p className="text-[11px] text-white-muted leading-relaxed">
                  Se eliminaran permanentemente: tu perfil, tickets, mensajes de chat, fotos, votos, pedidos y avatar.
                  Esta accion no se puede deshacer y no podras recuperar tus datos.
                </p>
              </div>
            </div>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Escribe ELIMINAR para confirmar"
              className="w-full px-4 py-3 rounded-xl border border-red-500/30 bg-transparent text-white placeholder:text-red-500/40 text-sm focus:outline-none focus:border-red-500/60 transition-colors"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-black-border text-white hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading || deleteConfirmText.trim().toUpperCase() !== 'ELIMINAR'}
                className={cn(
                  'flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-500/20 border border-red-500/40 text-red-400 transition-all',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'hover:bg-red-500/30 active:scale-[0.98]',
                )}
              >
                {deleteLoading ? 'Eliminando...' : 'Eliminar mi cuenta'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Legal links */}
      <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
        <Link href="/privacy" className="text-[11px] text-white/30 hover:text-white/60 transition-colors">
          Politica de Privacidad
        </Link>
        <span className="text-white/15">&middot;</span>
        <Link href="/terms" className="text-[11px] text-white/30 hover:text-white/60 transition-colors">
          Terminos de Servicio
        </Link>
        <span className="text-white/15">&middot;</span>
        <Link href="/support" className="text-[11px] text-white/30 hover:text-white/60 transition-colors">
          Soporte
        </Link>
      </div>
    </div>
  )
}
