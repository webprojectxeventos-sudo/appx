import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terminos de Servicio — Project X',
  description: 'Terminos y condiciones de uso de Project X',
}

export default function TermsPage() {
  return (
    <article className="space-y-8 text-white/70 text-sm leading-relaxed">
      <div>
        <h1 className="text-2xl font-bold text-gradient-primary mb-2">Terminos de Servicio</h1>
        <p className="text-white/40 text-xs">Ultima actualizacion: 8 de abril de 2026</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">1. Aceptacion de los terminos</h2>
        <p>
          Al registrarte y utilizar la aplicacion <strong className="text-white">Project X</strong> (en adelante, &quot;la App&quot;),
          operada por <strong className="text-white/90">JV Group Premium Events &amp; Business S.L.</strong> (CIF: B26773564),
          con domicilio social en Avda. Juan Carlos I, n.13, Torre Garena, planta 5, 28806 Alcala de Henares, Madrid,
          aceptas quedar vinculado por estos Terminos de Servicio. Si no estas de acuerdo con alguno de estos terminos, no utilices la App.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">2. Descripcion del servicio</h2>
        <p>
          Project X es una aplicacion movil (PWA) disenada para mejorar la experiencia de eventos de graduacion. La App
          ofrece las siguientes funcionalidades:
        </p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li>Acceso mediante codigo de entrada personal.</li>
          <li>Chat en tiempo real entre asistentes del mismo evento.</li>
          <li>Galeria de fotos compartida del evento.</li>
          <li>Votaciones y encuestas interactivas.</li>
          <li>Seleccion de bebidas y pedidos.</li>
          <li>Playlist colaborativa con sugerencias musicales.</li>
          <li>Notificaciones y anuncios del evento.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">3. Registro y acceso</h2>
        <p>
          Para usar la App necesitas un <strong className="text-white/90">codigo de acceso valido</strong> proporcionado con tu entrada
          al evento. Cada codigo es unico, personal e intransferible, y solo puede utilizarse una vez.
        </p>
        <p>
          Eres responsable de mantener la confidencialidad de tu cuenta y contrasena. Notificanos inmediatamente si
          detectas un uso no autorizado de tu cuenta.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">4. Conducta del usuario</h2>
        <p>Al utilizar la App te comprometes a:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li>No publicar contenido ofensivo, amenazante, discriminatorio o ilegal en el chat.</li>
          <li>No acosar, intimidar ni molestar a otros usuarios.</li>
          <li>No compartir contenido sexual explicito ni violento.</li>
          <li>No suplantar la identidad de otra persona.</li>
          <li>No intentar acceder a cuentas o datos de otros usuarios.</li>
          <li>No utilizar la App con fines comerciales no autorizados.</li>
          <li>No interferir con el funcionamiento normal de la App.</li>
        </ul>
        <p>
          Nos reservamos el derecho de <strong className="text-white/90">silenciar, suspender o eliminar</strong> cuentas que incumplan
          estas normas, sin previo aviso.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">5. Contenido del usuario</h2>
        <p>
          Eres responsable del contenido que publiques en la App (mensajes, sugerencias musicales, respuestas a encuestas).
          Al publicar contenido, nos otorgas una licencia no exclusiva para mostrarlo dentro de la App durante la duracion
          del evento.
        </p>
        <p>
          No reclamamos la propiedad de tu contenido. Sin embargo, nos reservamos el derecho a eliminar cualquier contenido
          que infrinja estos terminos o que consideremos inapropiado.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">6. Fotos del evento</h2>
        <p>
          Las fotos del evento son subidas por el equipo organizador y fotografos del evento. Al asistir al evento y
          utilizar la App, consientes que tu imagen pueda aparecer en la galeria de fotos compartida del evento.
        </p>
        <p>
          Las fotos descargadas desde la App incluyen una marca de agua con el nombre del evento. Si deseas que una
          foto en la que apareces sea eliminada, contactanos.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">7. Propiedad intelectual</h2>
        <p>
          La App, su diseno, codigo, logotipos y marca &quot;Project X&quot; son propiedad de JV Group Premium Events &amp; Business S.L. Queda prohibida
          la reproduccion, distribucion o modificacion de cualquier parte de la App sin autorizacion expresa.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">8. Disponibilidad del servicio</h2>
        <p>
          Nos esforzamos por mantener la App disponible en todo momento, especialmente durante los eventos. Sin embargo,
          no garantizamos que el servicio sea ininterrumpido o libre de errores. Podemos realizar mantenimientos o
          actualizaciones que requieran interrupciones temporales.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">9. Limitacion de responsabilidad</h2>
        <p>
          Project X se proporciona &quot;tal cual&quot;. No nos hacemos responsables de:
        </p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li>Danos derivados del uso o imposibilidad de uso de la App.</li>
          <li>Contenido publicado por otros usuarios.</li>
          <li>Perdida de datos debido a fallos tecnicos.</li>
          <li>Interrupciones del servicio por causas ajenas a nuestro control.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">10. Edad minima</h2>
        <p>
          Debes tener al menos <strong className="text-white/90">16 anos</strong> para utilizar la App. Al registrarte, confirmas
          que cumples este requisito de edad.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">11. Modificaciones</h2>
        <p>
          Podemos modificar estos terminos en cualquier momento. Los cambios significativos se comunicaran a traves de la App.
          El uso continuado de la App tras los cambios implica la aceptacion de los nuevos terminos.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">12. Legislacion aplicable</h2>
        <p>
          Estos terminos se rigen por la legislacion espanola. Para cualquier controversia, las partes se someten a los
          juzgados y tribunales de Madrid, Espana.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">13. Contacto</h2>
        <p>
          Si tienes cualquier duda sobre estos terminos, contactanos en:
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
