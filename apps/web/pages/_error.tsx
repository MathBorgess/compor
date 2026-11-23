import {useEffect} from 'react';
import type {NextPage} from 'next';

const statuses: Record<number,string> = {
  400: 'Bad Request',
  404: 'This page could not be found',
  405: 'Method Not Allowed',
  500: 'Internal Server Error',
};
const clientError = 'Application error: a client-side exception has occurred';
type Props = {statusCode?:number; title?:string; hostname?:string; withDarkMode?:boolean};

function errorReason(statusCode?:number,title?:string) {
  return title || (statusCode && statuses[statusCode]) || 'An unexpected error has occurred';
}

export function errorPageTitle(statusCode?:number,title?:string) {
  return statusCode ? statusCode + ': ' + errorReason(statusCode,title) : clientError;
}

const StudioError: NextPage<Props> = ({statusCode,title,hostname,withDarkMode = true}) => {
  const reason = errorReason(statusCode,title);
  useEffect(() => {document.title=errorPageTitle(statusCode,title);}, [statusCode,title]);
  return <main className={withDarkMode ? 'compor-error dark' : 'compor-error'}>
    <div>
      {statusCode ? <h1>{statusCode}</h1> : null}
      <p>{title || statusCode ? reason : clientError + (hostname ? ' while loading ' + hostname : '') + ' (see the browser console for more information)'}.</p>
    </div>
  </main>;
};

StudioError.getInitialProps = ({res,err,req}) => ({
  statusCode: res?.statusCode || (err ? err.statusCode : 404),
  hostname: typeof window === 'undefined' ? req?.headers.host : window.location.hostname,
});
export default StudioError;
