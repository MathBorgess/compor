export function GET(request) {
  return Response.redirect(new URL('/studio/compor-avatar.svg', request.url));
}
