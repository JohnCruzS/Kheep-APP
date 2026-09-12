// Metro convierte cada imagen importada en un identificador numérico de
// asset, que es lo que aceptan <Image source={...}> de React Native y
// expo-image. Esta declaración solo le cuenta eso a TypeScript.
declare module '*.png' {
  const asset: number;
  export default asset;
}
