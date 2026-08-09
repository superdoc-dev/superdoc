import Script from 'next/script';

const measurementId = 'G-E4T80WRJGS';
const productionHostname = 'docs.superdoc.dev';

export function GoogleAnalytics() {
  return (
    <>
      <Script async src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy='afterInteractive' />
      <Script id='google-analytics' strategy='afterInteractive'>
        {`
          if (window.location.hostname === '${productionHostname}') {
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${measurementId}');
          }
        `}
      </Script>
    </>
  );
}
