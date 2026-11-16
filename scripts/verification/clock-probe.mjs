import {scheduleSelectionReading} from '../../apps/web/lib/selection-reading-timer.ts';
import {readBatchProgress,recordBatchCompletion,nextBatch,freezeBatchWait,resumeBatchWait} from '../../apps/web/lib/exploration-batch.ts';

export function observeClock() {
  let now=0;
  const events=[],timers=[];
  const clock={schedule(callback,delayMs){const entry={at:now+delayMs,callback,active:true};timers.push(entry);return()=>{entry.active=false;};}};
  const advance=to=>{now=to;for(const entry of timers)if(entry.active&&entry.at<=now){entry.active=false;entry.callback();}};
  scheduleSelectionReading(()=>events.push({at:now,event:'selection_eligible'}),clock);
  advance(4999);const selectionAt4999=structuredClone(events);
  advance(5000);const selectionAt5000=structuredClone(events);
  const cancel=scheduleSelectionReading(()=>events.push({at:now,event:'cancelled_callback'}),clock);cancel();advance(10000);
  const cancelledEvents=events.filter(event=>event.event==='cancelled_callback');
  const store=new Map(),storage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
  let progress=readBatchProgress(storage,'batch','legacy',()=> '00000000-0000-4000-8000-000000000001');
  for(let position=1;position<=3;position++)progress=recordBatchCompletion(progress,{projectId:'33333333-3333-4333-8333-333333333333',requestId:`00000000-0000-4000-8000-${String(position+1).padStart(12,'0')}`,sequence:position-1,batchId:progress.batchId,position},0);
  let beforeError=null;try{nextBatch(progress,14999,()=> '00000000-0000-4000-8000-000000000006');}catch(error){beforeError=error.message;}
  const resumed=resumeBatchWait(freezeBatchWait(progress,4000),100000);
  const next=nextBatch(progress,15000,()=> '00000000-0000-4000-8000-000000000007');
  return {selectionAt4999,selectionAt5000,cancelledEvents,batchAt14999:{remainingMs:progress.nextAt-14999,error:beforeError},batchAt15000:{remainingMs:Math.max(0,progress.nextAt-15000),completed:next.completed},frozenAndResumed:{nextAt:resumed.nextAt,remainingMs:resumed.nextAt-100000}};
}
