declare global {
  // Used to ensure authkit-ssr is only configured once in Pages Router
  // eslint-disable-next-line no-var
  var __authkitSSRConfigured: boolean | undefined;
}

export {};