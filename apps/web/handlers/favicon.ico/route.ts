export function GET(request:Request) {
  return Response.redirect(new URL('/studio/compor-avatar.svg', request.url));
}
