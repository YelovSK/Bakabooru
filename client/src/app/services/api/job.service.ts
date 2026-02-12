import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface JobInfo {
    id: string;
    name: string;
    status: number; // 0=Idle, 1=Running, 2=Completed, 3=Failed, 4=Cancelled
    progress: number;
    message: string;
    startTime?: string;
    endTime?: string;
}

export interface JobViewModel {
    name: string;
    isRunning: boolean;
    activeJobInfo?: JobInfo;
}

export interface JobExecution {
    id: number;
    jobName: string;
    status: number;
    startTime: string;
    endTime?: string;
    errorMessage?: string;
}

export interface ScheduledJob {
    id: number;
    jobName: string;
    cronExpression: string;
    isEnabled: boolean;
    lastRun?: string;
    nextRun?: string;
}

@Injectable({
    providedIn: 'root'
})
export class JobService {
    private apiUrl = `${environment.apiBaseUrl}/jobs`;

    constructor(private http: HttpClient) { }

    getJobs(): Observable<JobViewModel[]> {
        return this.http.get<JobViewModel[]>(this.apiUrl);
    }

    getHistory(pageSize: number = 20, page: number = 1): Observable<{ items: JobExecution[]; total: number }> {
        return this.http.get<{ items: JobExecution[]; total: number }>(`${this.apiUrl}/history?pageSize=${pageSize}&page=${page}`);
    }

    getSchedules(): Observable<ScheduledJob[]> {
        return this.http.get<ScheduledJob[]>(`${this.apiUrl}/schedules`);
    }

    updateSchedule(id: number, schedule: Partial<ScheduledJob>): Observable<ScheduledJob> {
        return this.http.put<ScheduledJob>(`${this.apiUrl}/schedules/${id}`, schedule);
    }

    startJob(name: string, mode: 'missing' | 'all' = 'missing'): Observable<{ jobId: string }> {
        return this.http.post<{ jobId: string }>(`${this.apiUrl}/${name}/start?mode=${mode}`, {});
    }

    cancelJob(id: string): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/${id}/cancel`, {});
    }
}
