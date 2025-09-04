declare module 'socket.io' {
  export class Server {}
  export class Socket {
    handshake: any;
    join(room: string): void;
    leave(room: string): void;
    on(event: string, cb: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;
    to(room: string): any;
    broadcast: any;
  }
}
