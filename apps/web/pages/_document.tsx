import {Head,Html,Main,NextScript,type DocumentProps} from 'next/document';
import {siteMetadata} from '../lib/entry-content';
import {errorPageTitle} from './_error';

export default function Document({__NEXT_DATA__}:DocumentProps) {
  const {page,props} = __NEXT_DATA__;
  const status = page==='/404' ? 404 : props.pageProps?.statusCode;
  const title = props.pageProps?.title;
  return <Html lang="pt-BR">
    <Head>
      {page==='/'&&<>
        <title>{siteMetadata.title}</title>
        <meta name="description" content={siteMetadata.description}/>
        <link rel="icon" href={siteMetadata.icon}/>
      </>}
      {(page==='/404'||page==='/_error')&&<title>{errorPageTitle(
        typeof status==='number' ? status : undefined, typeof title==='string' ? title : undefined,
      )}</title>}
    </Head>
    <body><Main/><NextScript/></body>
  </Html>;
}
