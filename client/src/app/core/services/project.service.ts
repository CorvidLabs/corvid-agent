import { Injectable } from '@angular/core';
import { EntityStore } from './entity-store';
import type { Project, CreateProjectInput, UpdateProjectInput } from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class ProjectService extends EntityStore<Project> {
    protected readonly apiPath = '/projects';

    // Backward-compatible aliases
    readonly projects = this.entities;

    async loadProjects(): Promise<void> {
        return this.load();
    }

    async getProject(id: string): Promise<Project> {
        return this.getById(id);
    }

    async createProject(input: CreateProjectInput): Promise<Project> {
        return this.create(input);
    }

    async updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
        return this.update(id, input);
    }

    async deleteProject(id: string): Promise<void> {
        return this.remove(id);
    }
}
