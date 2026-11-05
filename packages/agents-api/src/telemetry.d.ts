export function recordAgentEvent(name:string):void;
export function recordProviderStatus(stage:string,status:number):void;
export function recordProviderClientError(response:Response):Promise<void>;
