import type { Metadata } from 'next';
import Link from 'next/link';
import { getSite } from '@/lib/brand-server';
import { LEGAL } from '@/lib/legal';
import { pageMetadata } from '@/lib/seo';
import { ContactLink, LegalPage, type LegalSection } from '@/components/legal/legal-page';

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(await getSite(), {
    title: 'Términos y condiciones',
    description: `Condiciones de uso de las APIs de ${LEGAL.owner} (Shalom API, Olva API y SUNAT API): cuenta, planes, pagos con Yape o Plin, uso permitido y responsabilidades.`,
    path: '/terminos',
  });
}

const link = 'font-medium text-[var(--accent)] underline-offset-2 hover:underline';

const SECTIONS: LegalSection[] = [
  {
    id: 'servicio',
    title: 'El servicio',
    body: (
      <>
        <p>
          {LEGAL.owner} (“nosotros”) ofrece Shalom API, Olva API y SUNAT API, y el panel desde el que las administras. Estos
          términos se aplican a todas las APIs y a todos sus sitios.
        </p>
        <p>
          Al crear una cuenta, crear una API key o usar las APIs aceptas estos términos y la{' '}
          <Link href="/privacidad" className={link}>Política de privacidad</Link>. Si no estás de acuerdo, no uses el servicio.
        </p>
      </>
    ),
  },
  {
    id: 'independencia',
    title: 'No somos Shalom, Olva ni la SUNAT',
    body: (
      <>
        <p>
          Somos un servicio independiente. <strong>No estamos afiliados ni autorizados por Shalom Empresarial, Olva Courier ni la
          SUNAT</strong>, ni nos patrocinan. Sus nombres y marcas son de sus titulares y los usamos solo para decir con qué servicio
          se integra cada API.
        </p>
        <p>
          La información de envíos, agencias y tarifas sale de los canales públicos de cada empresa. Puede cambiar, tener errores o
          dejar de estar disponible sin aviso. Si hay diferencias, vale lo que publique la propia empresa.
        </p>
      </>
    ),
  },
  {
    id: 'cuenta',
    title: 'Tu cuenta y tus API keys',
    body: (
      <ul>
        <li>Te registras con Google o con tu correo. Debes ser mayor de 18 años y, si usas el servicio para una empresa, poder actuar en su nombre.</li>
        <li>Los datos de tu cuenta deben ser verdaderos. Eres responsable de lo que se haga con tu cuenta y con tus keys.</li>
        <li>
          Cuida tus API keys como contraseñas: no las pongas en el código que llega al navegador ni en repositorios públicos. Solo
          guardamos un resumen cifrado (hash) y el inicio de cada key, así que no podemos recuperarla. Si una key se expone,
          revócala en el panel y crea otra.
        </li>
      </ul>
    ),
  },
  {
    id: 'planes',
    title: 'Planes, cuota y pagos',
    body: (
      <ul>
        <li>Cada API tiene su propio plan. El plan de prueba es gratis y tiene una cuota mensual pequeña para que pruebes.</li>
        <li>
          La cuota es la de tu plan en cada API, se cuenta por mes calendario y la comparten todas tus keys de esa API. Si se agota,
          la API responde con el error 429 hasta el mes siguiente o hasta que mejores tu plan.
        </li>
        <li>
          Los planes “ilimitados” son de uso razonable: tienen límites por minuto por key, publicados en la página de{' '}
          <Link href="/pricing" className={link}>precios</Link>. Podemos limitar por un tiempo un uso que ponga en riesgo el
          servicio para los demás clientes.
        </li>
        <li>
          Pagas con Yape o Plin y subes la foto del comprobante. Activamos el plan cuando validamos el pago. El plan dura hasta el
          mismo día del mes siguiente y <strong>no se renueva solo</strong>: para seguir, vuelves a pagar. Si vence, pasas al plan de prueba.
        </li>
        <li>
          Los precios están en soles y son los que publica la página de precios al momento de pagar. Si cambian, el cambio rige
          desde tu siguiente pago, nunca para un periodo que ya pagaste.
        </li>
        <li>
          Si no podemos validar un pago (no llegó o el monto no coincide), lo rechazamos y te lo indicamos en el panel. Si
          recibimos tu dinero y no activamos el plan, te lo devolvemos. Un plan ya activo no se reembolsa por el periodo en curso,
          salvo que el servicio no haya funcionado por una causa atribuible a nosotros.
        </li>
      </ul>
    ),
  },
  {
    id: 'uso',
    title: 'Uso permitido',
    body: (
      <>
        <p>No puedes:</p>
        <ul>
          <li>usar las APIs para algo ilegal, o para consultar envíos o datos de personas sin un motivo legítimo (por ejemplo, guías que no son tuyas ni de tus clientes);</li>
          <li>intentar saltarte la cuota, los límites por minuto o la seguridad del servicio, ni crear cuentas para repartir la cuota de un plan gratis;</li>
          <li>revender o compartir el acceso a las APIs como si fuera un servicio propio, sin un acuerdo por escrito con nosotros;</li>
          <li>sobrecargar el servicio a propósito o usarlo para atacar a terceros.</li>
        </ul>
        <p>
          Si nos envías datos personales de tus clientes (nombres, documentos, direcciones), tú eres responsable de ellos ante la Ley
          29733 y nosotros los tratamos por encargo tuyo, solo para prestarte el servicio.
        </p>
      </>
    ),
  },
  {
    id: 'sunat',
    title: 'Facturación electrónica (SUNAT API)',
    body: (
      <ul>
        <li>
          <strong>Tu empresa es la emisora.</strong> Los comprobantes y guías salen con tu RUC, tu certificado digital y tus
          credenciales de SUNAT. Tu empresa responde ante la SUNAT por su contenido, por emitirlos y comunicarlos a tiempo y por
          cumplir los requisitos para emitir de forma electrónica. No somos un Operador de Servicios Electrónicos (OSE) ni un
          Proveedor de Servicios Electrónicos (PSE).
        </li>
        <li>Lo que emites en el ambiente beta es de prueba y no tiene valor tributario.</li>
        <li>
          Guardamos tu usuario y clave SOL, tu certificado y tus credenciales de API de SUNAT cifrados. Los usamos solo para operar
          ante la SUNAT cuando tú lo pides por la API o el panel, y nunca los mostramos de vuelta.
        </li>
        <li>
          Que la SUNAT acepte, observe o rechace un comprobante depende de la SUNAT. Si no responde, reintentamos y te mostramos el estado.
        </li>
        <li>
          Te damos enlaces para descargar el XML, el CDR y el PDF, pero la obligación de conservarlos es de tu empresa: descárgalos y guárdalos.
        </li>
      </ul>
    ),
  },
  {
    id: 'disponibilidad',
    title: 'Disponibilidad y cambios en las APIs',
    body: (
      <>
        <p>
          Trabajamos para que las APIs funcionen siempre, pero no garantizamos que no se interrumpan ni un tiempo de respuesta,
          salvo lo que acordemos por escrito en un plan Empresarial. Dependemos de terceros (Shalom, Olva, la SUNAT y nuestros
          proveedores de nube) que pueden fallar o cambiar sin aviso.
        </p>
        <p>
          Podemos mejorar o cambiar las APIs. Si un cambio rompe tu integración, te avisamos con anticipación razonable, salvo
          urgencias (seguridad, o un cambio de un tercero que no podemos evitar).
        </p>
      </>
    ),
  },
  {
    id: 'responsabilidad',
    title: 'Responsabilidad',
    body: (
      <>
        <p>
          El servicio se ofrece tal cual. En la medida que la ley lo permita, no respondemos por daños indirectos (como ventas o
          ganancias perdidas) ni por decisiones que tomes con información de Shalom, Olva o la SUNAT. Nuestra responsabilidad total
          frente a ti se limita a lo que pagaste por el plan de la API afectada en los tres meses anteriores al hecho.
        </p>
        <p>
          Nada de esto limita los derechos que la ley te da como consumidor ni la responsabilidad que la ley no permite excluir.
        </p>
      </>
    ),
  },
  {
    id: 'suspension',
    title: 'Suspensión y cierre de la cuenta',
    body: (
      <>
        <p>
          Puedes dejar de usar el servicio y revocar tus keys cuando quieras. Para cerrar tu cuenta y borrar tus datos, escríbenos
          a <ContactLink />.
        </p>
        <p>
          Podemos suspender o cerrar cuentas o keys que incumplan estos términos, avisándote antes cuando sea posible. Si el
          incumplimiento es grave (fraude, abuso o un riesgo de seguridad), podemos hacerlo de inmediato.
        </p>
      </>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios a estos términos',
    body: (
      <p>
        Podemos actualizar estos términos. Publicamos la nueva versión en esta página con su fecha y, si el cambio es importante,
        te avisamos por correo o en el panel antes de que rija. Si sigues usando el servicio después, aceptas la nueva versión.
      </p>
    ),
  },
  {
    id: 'ley',
    title: 'Ley aplicable y reclamos',
    body: (
      <p>
        Estos términos se rigen por las leyes del Perú. Si tienes un problema, escríbenos primero a <ContactLink /> para
        resolverlo. Si eres consumidor, mantienes los derechos que te da el Código de Protección y Defensa del Consumidor (Ley
        29571), incluido acudir al Indecopi.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Términos y condiciones"
      intro={
        <p>
          Estas son las reglas para usar las APIs y el panel. Las escribimos en simple: qué ofrecemos, qué puedes hacer con el
          servicio y qué pasa con tus pagos.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
