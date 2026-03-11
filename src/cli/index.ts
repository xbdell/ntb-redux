export function main(): void {
  console.log('NTB-Redux');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
