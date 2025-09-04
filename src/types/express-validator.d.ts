declare module 'express-validator' {
  export type ValidationChain = any;
  export function body(...args: any[]): ValidationChain;
  export function param(...args: any[]): ValidationChain;
  export function query(...args: any[]): ValidationChain;
  export function check(...args: any[]): ValidationChain;
  export function validationResult(req: any): { isEmpty(): boolean; array(): any[] };
  const anyExport: any;
  export default anyExport;
}
