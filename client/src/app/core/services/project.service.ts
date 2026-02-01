import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import type { Project, CreateProjectInput, UpdateProjectInput } from '../models/project.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ProjectService {
    private readonly api = inject(ApiService);

    readonly projects = signal<Project[]>([]);
    readonly loading = signal(false);

    async loadProjects(): Promise<void> {
        this.loading.set(true);
        try {
            const projects = await firstValueFrom(this.api.get<Project[]>('/projects'));
            this.projects.set(projects);
        } finally {
            this.loading.set(false);
        }
    }

    async getProject(id: string): Promise<Project> {
        return firstValueFrom(this.api.get<Project>(`/projects/${id}`));
    }

    async createProject(input: CreateProjectInput): Promise<Project> {
        const project = await firstValueFrom(this.api.post<Project>('/projects', input));
        await this.loadProjects();
        return project;
    }

    async updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
        const project = await firstValueFrom(this.api.put<Project>(`/projects/${id}`, input));
        await this.loadProjects();
        return project;
    }

    async deleteProject(id: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/projects/${id}`));
        await this.loadProjects();
    }
}
