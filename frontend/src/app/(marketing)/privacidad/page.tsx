import type { Metadata } from 'next';
import Link from 'next/link';
import { getSite } from '@/lib/brand-server';
import { LEGAL } from '@/lib/legal';
import { pageMetadata } from '@/lib/seo';
import { ContactLink, LegalPage, type LegalSection } from '@/components/legal/legal-page';

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(await getSite(), {
    title: 'Política de privacidad',
    description: `Qué datos personales tratan las APIs de ${LEGAL.owner}, para qué, con quién se comparten, qué cookies usamos y cómo ejercer tus derechos (Ley 29733).`,
    path: '/privacidad',
  });
}

const SECTIONS: LegalSection[] = [
  {
    id: 'responsable',
    title: 'Quién es responsable',
    body: (
      <p>
        {LEGAL.owner} es responsable de los datos personales que tratamos para darte el servicio. Para cualquier consulta sobre
        tus datos, escríbenos a <ContactLink />. Esta política sigue la Ley 29733, Ley de Protección de Datos Personales, y su
        reglamento.
      </p>
    ),
  },
  {
    id: 'datos',
    title: 'Qué datos tratamos',
    body: (
      <ul>
        <li>
          <strong>Tu cuenta:</strong> correo, nombre (si lo das o viene de tu cuenta de Google) y el identificador de tu cuenta de
          Google o de Firebase. Tu contraseña la gestiona Google Firebase Authentication: nosotros no la vemos ni la guardamos.
        </li>
        <li>
          <strong>Tus pagos:</strong> plan, monto, método (Yape o Plin), el número de operación si lo indicas y la foto del
          comprobante que subes, que puede mostrar tu nombre y parte de tu número de celular.
        </li>
        <li>
          <strong>El uso de las APIs:</strong> tus API keys (solo su hash y su inicio), el consumo de cada mes y registros técnicos
          de las peticiones (fecha, ruta, resultado y dirección IP) para seguridad y para resolver problemas.
        </li>
        <li>
          <strong>Lo que envías por las APIs:</strong> números y claves de guías, ubicaciones para buscar agencias y la URL de tus
          webhooks. En SUNAT API, además, los datos de tu empresa (RUC, razón social, domicilio), tus credenciales de SUNAT y tu
          certificado (cifrados) y los datos de tus comprobantes, incluidos los de tus clientes (nombre, DNI o RUC, dirección).
        </li>
      </ul>
    ),
  },
  {
    id: 'finalidades',
    title: 'Para qué los usamos',
    body: (
      <>
        <ul>
          <li>Crear tu cuenta, iniciar tu sesión y protegerla.</li>
          <li>Prestarte las APIs y medir la cuota de tu plan.</li>
          <li>Validar tus pagos y activar tus planes.</li>
          <li>Avisarte de pagos, vencimientos y cambios importantes del servicio.</li>
          <li>Prevenir abusos y fraudes, y darte soporte.</li>
          <li>Cumplir obligaciones legales, tributarias y contables.</li>
        </ul>
        <p>
          Tratamos estos datos porque son necesarios para la relación contractual contigo (artículo 14 de la Ley 29733). No
          vendemos tus datos, no los usamos para publicidad y no los compartimos con nadie para fines propios de ese tercero.
        </p>
      </>
    ),
  },
  {
    id: 'clientes',
    title: 'Los datos de tus clientes',
    body: (
      <p>
        Cuando nos envías datos de otras personas (destinatarios de tus envíos o clientes de tus comprobantes), tú eres el
        responsable de esos datos y nosotros los tratamos por encargo tuyo, solo para prestarte el servicio. Debes contar con una
        base legal para tratarlos y para compartirlos con nosotros.
      </p>
    ),
  },
  {
    id: 'terceros',
    title: 'Con quién los compartimos',
    body: (
      <>
        <p>Con proveedores que nos ayudan a prestar el servicio y que tratan los datos solo por encargo nuestro:</p>
        <ul>
          <li><strong>Google</strong> (Firebase Authentication y Google Cloud, donde corre la API), en Estados Unidos y Brasil.</li>
          <li><strong>Neon</strong> (base de datos), en Brasil.</li>
          <li><strong>Vercel</strong> (alojamiento de este sitio), en Brasil, con una red de distribución global.</li>
          <li><strong>Resend</strong> (correos de aviso, por ejemplo cuando registras un pago), en Estados Unidos.</li>
        </ul>
        <p>
          Además, la SUNAT, Shalom y Olva reciben las consultas y comprobantes que envías, porque eso es lo que hace el servicio.
          Y entregamos datos a una autoridad solo cuando una ley o una orden judicial nos lo exige.
        </p>
        <p>
          Como estos proveedores están fuera del Perú, tus datos se transfieren a otros países (flujo transfronterizo) solo para
          prestarte el servicio.
        </p>
      </>
    ),
  },
  {
    id: 'conservacion',
    title: 'Cuánto tiempo los guardamos',
    body: (
      <p>
        Mientras tengas tu cuenta y los necesitemos para darte el servicio. Los pagos se guardan el tiempo que exigen las normas
        tributarias y contables, y los registros técnicos, por un tiempo limitado. Si cierras tu cuenta, borramos o anonimizamos
        tus datos, salvo los que la ley nos obligue a conservar.
      </p>
    ),
  },
  {
    id: 'seguridad',
    title: 'Cómo los protegemos',
    body: (
      <ul>
        <li>Todo el tráfico va cifrado (HTTPS).</li>
        <li>Las contraseñas las gestiona Firebase; de cada API key guardamos solo su hash.</li>
        <li>Las credenciales y certificados de SUNAT se guardan cifrados y nunca se devuelven.</li>
        <li>Los comprobantes de pago solo los ves tú y quien valida los pagos.</li>
      </ul>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies',
    body: (
      <>
        <p>Usamos solo cookies necesarias para que el sitio funcione:</p>
        <ul>
          <li><strong>mathyu_session</strong>: mantiene tu sesión iniciada (dura 7 días).</li>
          <li><strong>mathyu_brand</strong>: recuerda qué sitio estás viendo en la vista previa (dura 30 días).</li>
        </ul>
        <p>
          No usamos cookies de publicidad ni de analítica de terceros. Si ingresas con Google, Google puede usar sus propias cookies
          en su ventana de inicio de sesión.
        </p>
      </>
    ),
  },
  {
    id: 'derechos',
    title: 'Tus derechos',
    body: (
      <>
        <p>
          Puedes pedir acceso a tus datos, corregirlos, cancelarlos (borrarlos) u oponerte a su tratamiento, y revocar tu
          consentimiento cuando corresponda. Escríbenos a <ContactLink /> desde el correo de tu cuenta y te responderemos en los
          plazos que fija la ley.
        </p>
        <p>
          Si no quedas conforme con la respuesta, puedes acudir a la Autoridad Nacional de Protección de Datos Personales del
          Ministerio de Justicia y Derechos Humanos.
        </p>
      </>
    ),
  },
  {
    id: 'menores',
    title: 'Menores de edad',
    body: <p>El servicio no está dirigido a menores de 18 años y no recogemos sus datos a sabiendas.</p>,
  },
  {
    id: 'cambios',
    title: 'Cambios a esta política',
    body: (
      <p>
        Si cambiamos esta política, publicamos la nueva versión en esta página con su fecha y, si el cambio es importante, te
        avisamos por correo o en el panel. Las reglas de uso del servicio están en los{' '}
        <Link href="/terminos" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">Términos y condiciones</Link>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      intro={
        <p>
          Aquí te contamos qué datos tuyos tratamos cuando usas las APIs y el panel, para qué, con quién los compartimos y cómo
          ejercer tus derechos.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
