import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Eliminar cuenta — Project X',
  description:
    'Como eliminar tu cuenta de Project X Eventos y que datos se borran',
}

export default function DeleteAccountPage() {
  return (
    <article className="space-y-8 text-white/70 text-sm leading-relaxed">
      <div>
        <h1 className="text-2xl font-bold text-gradient-primary mb-2">
          Eliminar tu cuenta
        </h1>
        <p className="text-white/40 text-xs">
          Ultima actualizacion: 15 de abril de 2026
        </p>
      </div>

      <section className="space-y-3">
        <p>
          En Project X respetamos tu derecho a controlar tus datos personales.
          Puedes eliminar tu cuenta y todos los datos asociados en cualquier
          momento, de forma directa desde la propia aplicacion.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">
          1. Como eliminar tu cuenta desde la app
        </h2>
        <ol className="list-decimal list-inside space-y-1.5 pl-2">
          <li>
            Abre la aplicacion Project X en tu movil o entra en{' '}
            <a
              href="https://app.projectxeventos.es"
              className="text-primary hover:text-primary-light transition-colors"
            >
              app.projectxeventos.es
            </a>
            .
          </li>
          <li>Inicia sesion con tu cuenta.</li>
          <li>
            Pulsa en tu avatar arriba a la derecha o entra en el apartado{' '}
            <strong className="text-white/90">Mi perfil</strong>.
          </li>
          <li>
            Desplazate hasta el final de la pagina y pulsa{' '}
            <strong className="text-red-400">Eliminar cuenta</strong>.
          </li>
          <li>
            Escribe <strong className="text-white/90">ELIMINAR</strong> en la
            casilla de confirmacion y pulsa{' '}
            <strong className="text-white/90">Eliminar mi cuenta</strong>.
          </li>
          <li>
            Tu cuenta y todos tus datos se eliminaran inmediatamente de forma
            permanente.
          </li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">
          2. Que datos se eliminan
        </h2>
        <p>Al eliminar tu cuenta, borramos de forma permanente:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li>
            <strong className="text-white/90">Perfil:</strong> nombre, email,
            contrasena, foto de avatar, genero.
          </li>
          <li>
            <strong className="text-white/90">Tickets y entradas</strong>{' '}
            registrados a tu nombre.
          </li>
          <li>
            <strong className="text-white/90">Mensajes de chat</strong> que
            hayas enviado en la app.
          </li>
          <li>
            <strong className="text-white/90">Fotos</strong> que hayas subido
            personalmente.
          </li>
          <li>
            <strong className="text-white/90">Respuestas a encuestas</strong> y
            votos en votaciones.
          </li>
          <li>
            <strong className="text-white/90">Pedidos de bebidas</strong> y
            otras interacciones.
          </li>
          <li>
            <strong className="text-white/90">Notificaciones push</strong> y
            tokens asociados a tu dispositivo.
          </li>
          <li>
            <strong className="text-white/90">Incidencias</strong> reportadas
            por tu cuenta.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">
          3. Datos que se conservan
        </h2>
        <p>
          Por requisitos legales o contables, algunos datos pueden conservarse
          de forma anonimizada durante los periodos de retencion obligatorios:
        </p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li>
            <strong className="text-white/90">Facturacion y pagos:</strong> si
            procede, durante el periodo legal obligatorio (hasta 6 anos segun
            el Codigo de Comercio).
          </li>
          <li>
            <strong className="text-white/90">Logs de seguridad:</strong>{' '}
            registros tecnicos anonimos durante un maximo de 12 meses.
          </li>
        </ul>
        <p>
          El resto de datos personales identificables se eliminan
          inmediatamente cuando solicitas la eliminacion de tu cuenta.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">
          4. Si no puedes acceder a la app
        </h2>
        <p>
          Si no puedes iniciar sesion o necesitas ayuda para eliminar tu cuenta,
          envianos un correo desde la direccion registrada en Project X a:
        </p>
        <p>
          <a
            href="mailto:contacto@projectxeventos.es?subject=Eliminar%20cuenta%20Project%20X"
            className="text-primary hover:text-primary-light transition-colors"
          >
            contacto@projectxeventos.es
          </a>
        </p>
        <p>
          Procesaremos tu solicitud en un plazo maximo de 30 dias, tal y como
          exige el Reglamento General de Proteccion de Datos (RGPD).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">
          5. Derechos bajo el RGPD
        </h2>
        <p>
          Ademas del derecho a la supresion (a ser olvidado), tambien puedes
          ejercer los siguientes derechos contactandonos en la direccion
          anterior:
        </p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li>Acceso a tus datos personales.</li>
          <li>Rectificacion de datos incorrectos.</li>
          <li>Limitacion del tratamiento.</li>
          <li>Portabilidad de los datos.</li>
          <li>Oposicion al tratamiento.</li>
        </ul>
        <p>
          Puedes consultar el detalle completo en nuestra{' '}
          <a
            href="/privacy"
            className="text-primary hover:text-primary-light transition-colors"
          >
            Politica de Privacidad
          </a>
          .
        </p>
      </section>
    </article>
  )
}
