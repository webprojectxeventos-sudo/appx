import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Politica de Privacidad — Project X',
  description: 'Politica de privacidad y proteccion de datos de Project X',
}

export default function PrivacyPage() {
  return (
    <article className="space-y-8 text-white/70 text-sm leading-relaxed">
      <div>
        <h1 className="text-2xl font-bold text-gradient-primary mb-2">Politica de Privacidad</h1>
        <p className="text-white/40 text-xs">Ultima actualizacion: 8 de abril de 2026</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">1. Responsable del tratamiento</h2>
        <p>
          El responsable del tratamiento de tus datos personales es <strong className="text-white">JV Group Premium Events &amp; Business S.L.</strong>,
          con CIF <strong className="text-white/90">B26773564</strong> y domicilio social en Avenida Juan Carlos I, n.13,
          Torre Garena, planta 5, 28806 Alcala de Henares, Madrid.
        </p>
        <p>
          Para cualquier consulta relacionada con la proteccion de datos puedes contactarnos en:{' '}
          <a href="mailto:contacto@projectxeventos.es" className="text-primary hover:text-primary-light transition-colors">
            contacto@projectxeventos.es
          </a>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">2. Datos que recogemos</h2>
        <p>Al utilizar Project X, podemos recoger los siguientes datos personales:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li><strong className="text-white/90">Datos de registro:</strong> nombre completo, direccion de email, contrasena (cifrada), genero.</li>
          <li><strong className="text-white/90">Codigo de acceso:</strong> el codigo unico proporcionado con tu entrada al evento.</li>
          <li><strong className="text-white/90">Foto de perfil:</strong> imagen que subas voluntariamente como avatar.</li>
          <li><strong className="text-white/90">Mensajes de chat:</strong> contenido que envies en los chats del evento.</li>
          <li><strong className="text-white/90">Participacion en encuestas y votaciones:</strong> tus respuestas y preferencias de bebidas.</li>
          <li><strong className="text-white/90">Fotos del evento:</strong> imagenes subidas por el staff del evento en las que puedas aparecer.</li>
          <li><strong className="text-white/90">Datos tecnicos:</strong> tipo de dispositivo, navegador, direccion IP (para seguridad).</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">3. Finalidad del tratamiento</h2>
        <p>Utilizamos tus datos para:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li>Gestionar tu acceso al evento y validar tu entrada.</li>
          <li>Permitirte participar en el chat, encuestas y votaciones del evento.</li>
          <li>Facilitar el acceso a la galeria de fotos del evento.</li>
          <li>Enviarte notificaciones relacionadas con el evento (si las activas).</li>
          <li>Gestionar el servicio de bebidas y pedidos.</li>
          <li>Garantizar la seguridad y moderacion de la plataforma.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">4. Base legal</h2>
        <p>
          El tratamiento de tus datos se basa en el <strong className="text-white/90">consentimiento</strong> que prestas al
          registrarte en la aplicacion y aceptar esta politica de privacidad, de conformidad con el Reglamento General de
          Proteccion de Datos (RGPD) y la Ley Organica 3/2018 de Proteccion de Datos Personales (LOPDGDD).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">5. Almacenamiento y seguridad</h2>
        <p>
          Tus datos se almacenan en servidores seguros proporcionados por <strong className="text-white/90">Supabase</strong> (infraestructura
          en la Union Europea). Aplicamos medidas de seguridad tecnicas y organizativas para proteger tus datos,
          incluyendo cifrado de contrasenas, conexiones HTTPS y politicas de acceso restringido.
        </p>
        <p>
          Conservaremos tus datos mientras mantengas tu cuenta activa. Tras la finalizacion del evento, los datos se
          conservaran durante un plazo maximo de 12 meses, tras el cual seran eliminados.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">6. Tus derechos</h2>
        <p>De acuerdo con el RGPD, tienes derecho a:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li><strong className="text-white/90">Acceso:</strong> conocer que datos tenemos sobre ti.</li>
          <li><strong className="text-white/90">Rectificacion:</strong> corregir datos inexactos o incompletos.</li>
          <li><strong className="text-white/90">Supresion:</strong> solicitar la eliminacion de tus datos (&quot;derecho al olvido&quot;).</li>
          <li><strong className="text-white/90">Limitacion:</strong> restringir el tratamiento en determinadas circunstancias.</li>
          <li><strong className="text-white/90">Portabilidad:</strong> recibir tus datos en un formato estructurado.</li>
          <li><strong className="text-white/90">Oposicion:</strong> oponerte al tratamiento de tus datos.</li>
        </ul>
        <p>
          Para ejercer estos derechos, escribenos a{' '}
          <a href="mailto:contacto@projectxeventos.es" className="text-primary hover:text-primary-light transition-colors">
            contacto@projectxeventos.es
          </a>{' '}
          indicando tu nombre y el derecho que deseas ejercer. Responderemos en un plazo maximo de 30 dias.
        </p>
        <p>
          Tambien tienes derecho a presentar una reclamacion ante la{' '}
          <strong className="text-white/90">Agencia Espanola de Proteccion de Datos (AEPD)</strong> si consideras que
          tus derechos no han sido respetados.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">7. Cookies y tecnologias</h2>
        <p>
          Project X es una Progressive Web App (PWA) que utiliza las siguientes tecnologias de almacenamiento local:
        </p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li><strong className="text-white/90">Service Worker:</strong> permite el funcionamiento offline y la recepcion de notificaciones push.</li>
          <li><strong className="text-white/90">LocalStorage:</strong> almacena preferencias de la aplicacion (tema visual, sesion).</li>
          <li><strong className="text-white/90">Cookies de sesion:</strong> gestionan la autenticacion de tu cuenta de forma segura.</li>
        </ul>
        <p>No utilizamos cookies de seguimiento ni de publicidad de terceros.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">8. Menores de edad</h2>
        <p>
          Project X esta dirigido a personas mayores de 16 anos. No recogemos conscientemente datos de menores de 16 anos.
          Si eres padre o tutor y crees que tu hijo/a menor ha proporcionado datos personales, contactanos para que
          procedamos a su eliminacion.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">9. Cambios en esta politica</h2>
        <p>
          Podemos actualizar esta politica de privacidad ocasionalmente. Te notificaremos de cualquier cambio significativo
          a traves de la aplicacion. Te recomendamos revisarla periodicamente.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">10. Contacto</h2>
        <p>
          Si tienes cualquier duda sobre esta politica de privacidad o sobre el tratamiento de tus datos, puedes contactarnos en:
        </p>
        <div className="card p-4 space-y-1">
          <p className="text-white font-medium">JV Group Premium Events &amp; Business S.L.</p>
          <p className="text-white/50">CIF: B26773564</p>
          <p className="text-white/50">Avda. Juan Carlos I, n.13, Torre Garena, planta 5, 28806 Alcala de Henares, Madrid</p>
          <p>
            Email:{' '}
            <a href="mailto:contacto@projectxeventos.es" className="text-primary hover:text-primary-light transition-colors">
              contacto@projectxeventos.es
            </a>
          </p>
          <p>
            Web:{' '}
            <a href="https://projectxeventos.es" className="text-primary hover:text-primary-light transition-colors" target="_blank" rel="noopener noreferrer">
              projectxeventos.es
            </a>
          </p>
        </div>
      </section>
    </article>
  )
}
