import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Soporte — Project X',
  description:
    'Contacta con el equipo de Project X Eventos. Ayuda sobre tickets, cuenta, escaner y mas.',
}

const SUPPORT_EMAIL = 'soporte@projectxeventos.es'

export default function SupportPage() {
  return (
    <article className="space-y-8 text-white/70 text-sm leading-relaxed">
      <div>
        <h1 className="text-2xl font-bold text-gradient-primary mb-2">
          Soporte y ayuda
        </h1>
        <p className="text-white/40 text-xs">
          Ultima actualizacion: 15 de abril de 2026
        </p>
      </div>

      <section className="space-y-3">
        <p>
          Si necesitas ayuda con Project X Eventos, queremos resolverlo lo
          antes posible. Tienes varias maneras de contactar con nosotros segun
          la urgencia del problema.
        </p>
      </section>

      {/* Primary contact card */}
      <section className="card p-6 space-y-3 border-primary/30 bg-primary/5">
        <h2 className="text-lg font-semibold text-white">
          Contacto directo
        </h2>
        <p className="text-white/70">
          La forma mas rapida de recibir ayuda es por correo electronico.
          Respondemos en un plazo maximo de{' '}
          <strong className="text-white">48 horas laborables</strong>.
        </p>
        <div className="pt-2 space-y-2">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1">
              Correo de soporte
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-primary hover:text-primary-light transition-colors font-medium text-base"
            >
              {SUPPORT_EMAIL}
            </a>
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1">
              Empresa
            </p>
            <p className="text-white/80">
              JV Group Premium Events &amp; Business S.L.
            </p>
            <p className="text-white/50 text-xs">
              Madrid, Espana
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">
          Preguntas frecuentes
        </h2>

        <details className="card p-4 cursor-pointer group">
          <summary className="font-medium text-white/90 list-none flex items-center justify-between">
            <span>No puedo iniciar sesion</span>
            <span className="text-white/40 group-open:rotate-180 transition-transform">&#9662;</span>
          </summary>
          <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2 text-white/60">
            <p>
              Si has olvidado tu contrasena, pulsa{' '}
              <strong className="text-white/80">Olvide mi contrasena</strong>{' '}
              en la pantalla de inicio de sesion. Recibiras un correo con un
              enlace para restablecerla.
            </p>
            <p>
              Si el correo no llega en 5 minutos, revisa la carpeta de spam o
              escribenos a{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-primary hover:text-primary-light"
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </div>
        </details>

        <details className="card p-4 cursor-pointer group">
          <summary className="font-medium text-white/90 list-none flex items-center justify-between">
            <span>Como compro una entrada para un evento?</span>
            <span className="text-white/40 group-open:rotate-180 transition-transform">&#9662;</span>
          </summary>
          <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2 text-white/60">
            <p>
              Project X es la app oficial para asistentes de eventos de
              graduacion organizados con nuestro servicio. Las entradas se
              compran a traves del colegio o el promotor del evento, no
              directamente desde la app. Una vez comprada, recibiras un codigo
              QR en tu perfil que sirve para entrar al recinto.
            </p>
          </div>
        </details>

        <details className="card p-4 cursor-pointer group">
          <summary className="font-medium text-white/90 list-none flex items-center justify-between">
            <span>Donde esta mi codigo QR de entrada?</span>
            <span className="text-white/40 group-open:rotate-180 transition-transform">&#9662;</span>
          </summary>
          <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2 text-white/60">
            <p>
              Inicia sesion, entra en la pestana{' '}
              <strong className="text-white/80">Home</strong> y veras tu
              entrada con el codigo QR. Si no aparece, asegurate de que tu
              cuenta esta asociada al evento correcto. Si crees que deberia
              tener entrada y no la ves, escribenos.
            </p>
          </div>
        </details>

        <details className="card p-4 cursor-pointer group">
          <summary className="font-medium text-white/90 list-none flex items-center justify-between">
            <span>Como elimino mi cuenta?</span>
            <span className="text-white/40 group-open:rotate-180 transition-transform">&#9662;</span>
          </summary>
          <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2 text-white/60">
            <p>
              Puedes eliminar tu cuenta y todos tus datos directamente desde la
              app. Entra en{' '}
              <strong className="text-white/80">Mi perfil</strong> y desplazate
              al final de la pagina, donde encontraras el boton{' '}
              <strong className="text-red-400">Eliminar cuenta</strong>.
            </p>
            <p>
              Tambien puedes consultar el proceso completo en la pagina{' '}
              <a
                href="/delete-account"
                className="text-primary hover:text-primary-light"
              >
                /delete-account
              </a>
              .
            </p>
          </div>
        </details>

        <details className="card p-4 cursor-pointer group">
          <summary className="font-medium text-white/90 list-none flex items-center justify-between">
            <span>El escaner no funciona / no enciende la camara</span>
            <span className="text-white/40 group-open:rotate-180 transition-transform">&#9662;</span>
          </summary>
          <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2 text-white/60">
            <p>
              El escaner solo esta disponible para cuentas de staff autorizadas
              (promotores, personal de puerta, admins).
            </p>
            <p>
              Si eres staff y la camara no arranca, comprueba que has aceptado
              el permiso de camara en{' '}
              <strong className="text-white/80">Ajustes &gt; Project X</strong>{' '}
              en tu iPhone. Si sigue sin funcionar, escribenos con el modelo de
              tu dispositivo y la version de iOS.
            </p>
          </div>
        </details>

        <details className="card p-4 cursor-pointer group">
          <summary className="font-medium text-white/90 list-none flex items-center justify-between">
            <span>Tengo un problema con mi evento</span>
            <span className="text-white/40 group-open:rotate-180 transition-transform">&#9662;</span>
          </summary>
          <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2 text-white/60">
            <p>
              Para problemas especificos de un evento concreto (hora, lugar,
              bebida, lista de invitados, incidencias en la noche del evento),
              tu organizador o promotor es el contacto directo. Si necesitas
              escalar a Project X, manda un correo a{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-primary hover:text-primary-light"
              >
                {SUPPORT_EMAIL}
              </a>{' '}
              indicando el nombre del evento y la fecha.
            </p>
          </div>
        </details>
      </section>

      {/* Links */}
      <section className="space-y-3 pt-4 border-t border-white/[0.06]">
        <h2 className="text-base font-semibold text-white">Mas informacion</h2>
        <ul className="space-y-2">
          <li>
            <a
              href="/privacy"
              className="text-primary hover:text-primary-light transition-colors"
            >
              Politica de privacidad
            </a>
          </li>
          <li>
            <a
              href="/terms"
              className="text-primary hover:text-primary-light transition-colors"
            >
              Terminos y condiciones
            </a>
          </li>
          <li>
            <a
              href="/delete-account"
              className="text-primary hover:text-primary-light transition-colors"
            >
              Como eliminar tu cuenta
            </a>
          </li>
        </ul>
      </section>

      <section className="pt-4 text-xs text-white/30 text-center">
        <p>
          Si tu pregunta no aparece aqui, escribenos a{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-primary/70 hover:text-primary"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </article>
  )
}
