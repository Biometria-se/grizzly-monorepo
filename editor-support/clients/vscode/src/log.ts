/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';

export class ConsoleLogOutputChannel {
    public channel: vscode.LogOutputChannel;

    public constructor(name: string, options: {log: true}) {
        this.channel = vscode.window.createOutputChannel(name, options);
        this.channel.show();
    }

    private log(callee: string, message: string | Error, ...args: any[]): void {
        // send log to output channel
        this.channel[callee].call(this.channel, message, ...args);

        if (process.env.VERBOSE) {
            switch (callee) {
                case 'trace':
                case 'debug':
                    callee = 'log';
            }
        }

        // send log to console
        console[callee].call(console, message, ...args);
    }

    public trace(message: string, ...args: any[]): void {
        this.log('trace', message, ...args);
    }

    public debug(message: string, ...args: any[]): void {
        this.log('debug', message, ...args);
    }

    public info(message: string, ...args: any[]): void {
        this.log('info', message, ...args);
    }

    public warn(message: string, ...args: any[]): void {
        this.log('warn', message, ...args);
    }

    public error(error: string | Error, ...args: any[]): void {
        this.log('error', error, ...args);
    }
}
