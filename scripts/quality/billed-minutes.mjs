import { readFileSync, realpathSync } from 'node:fs';

// GitHub rounds each job that ran up to a whole minute and does not bill a
// skipped job. A job still running, such as the gate itself, counts from now.
export function billedJobs(jobs, now = Date.now()) {
  return jobs.map(job => {
    const ran = job.started_at && job.conclusion !== 'skipped';
    const end = job.completed_at ? Date.parse(job.completed_at) : now;
    const seconds = ran ? Math.max(0, Math.round((end - Date.parse(job.started_at)) / 1000)) : 0;
    return { name: job.name, result: job.conclusion ?? job.status, seconds, billed: ran ? Math.max(1, Math.ceil(seconds / 60)) : 0 };
  });
}

export function summary(rows) {
  const total = rows.reduce((sum, row) => sum + row.billed, 0);
  const duration = seconds => `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
  return [
    '### Minutos do GitHub Actions',
    '',
    '| Job | Resultado | Duração | Minutos cobrados (estimativa) |',
    '| --- | --- | ---: | ---: |',
    ...rows.map(row => `| ${row.name} | ${row.result} | ${duration(row.seconds)} | ${row.billed} |`),
    '',
    `Estimativa desta execução: **${total} min**, com cada job arredondado para cima e jobs pulados fora da conta. A meta mensal é 1.500 min.`,
    '',
  ].join('\n');
}

if (process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename) {
  const { jobs } = JSON.parse(readFileSync(0, 'utf8'));
  process.stdout.write(summary(billedJobs(jobs)));
}
