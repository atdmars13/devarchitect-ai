/**
 * Unit Tests for ProjectService
 * 
 * Tests CRUD operations, library management, and workspace linking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createMockExtensionContext,
    sampleProjectData,
    workspace,
    MockExtensionContext
} from '../__mocks__/vscode';

// Import the service - vscode will be resolved to our mock via alias
import { ProjectService, ProjectData, DevBlock } from '../services/ProjectService';

describe('ProjectService', () => {
    let service: ProjectService;
    let mockContext: MockExtensionContext;

    beforeEach(() => {
        mockContext = createMockExtensionContext();
        vi.clearAllMocks();
        
        // Reset workspace mock
        workspace.fs.stat.mockRejectedValue(new Error('File not found'));
        workspace.findFiles.mockResolvedValue([]);
        
        service = new ProjectService(mockContext as any);
    });

    // ========================================================================
    // Initialization Tests
    // ========================================================================

    describe('initialization', () => {
        it('should create service without errors', () => {
            expect(service).toBeDefined();
        });

        it('should return a default project when no project is saved', () => {
            const project = service.getCurrentProject();
            expect(project).toBeDefined();
            expect(project.type).toBe('WEB_MOBILE');
            expect(project.status).toBe('PLANNING');
            expect(project.roadmap).toEqual([]);
        });

        it('should report hasCurrentProject as false when no project loaded', () => {
            expect(service.hasCurrentProject()).toBe(false);
        });

        it('should return null from getCurrentProjectOrNull when no project loaded', () => {
            expect(service.getCurrentProjectOrNull()).toBeNull();
        });

        it('should load existing project from global state', () => {
            // Setup stored project data
            const storedProject = { ...sampleProjectData };
            mockContext.globalState._store['devarchitect_active_project'] = storedProject.id;
            mockContext.globalState._store[`devarchitect_project_data_${storedProject.id}`] = storedProject;
            mockContext.globalState._store['devarchitect_projects_library'] = [
                { id: storedProject.id, name: storedProject.name, type: storedProject.type, lastUpdated: storedProject.lastUpdated }
            ];

            // Create new service instance to trigger loadProject
            const newService = new ProjectService(mockContext as any);
            
            expect(newService.hasCurrentProject()).toBe(true);
            const project = newService.getCurrentProject();
            expect(project.id).toBe(storedProject.id);
            expect(project.name).toBe(storedProject.name);
        });
    });

    // ========================================================================
    // Project CRUD Tests
    // ========================================================================

    describe('saveProject', () => {
        it('should save project to global state', () => {
            const project = { ...sampleProjectData };
            
            service.saveProject(project);
            
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                `devarchitect_project_data_${project.id}`,
                expect.objectContaining({ id: project.id })
            );
        });

        it('should update lastUpdated timestamp on save', () => {
            const project = { ...sampleProjectData, lastUpdated: '2020-01-01T00:00:00.000Z' };
            const beforeSave = new Date().toISOString();
            
            service.saveProject(project);
            
            const savedProject = service.getCurrentProject();
            expect(new Date(savedProject.lastUpdated).getTime())
                .toBeGreaterThanOrEqual(new Date(beforeSave).getTime());
        });

        it('should set active project ID after save', () => {
            const project = { ...sampleProjectData };
            
            service.saveProject(project);
            
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'devarchitect_active_project',
                project.id
            );
        });

        it('should mark project as explicitly loaded after save', () => {
            const project = { ...sampleProjectData };
            
            expect(service.hasCurrentProject()).toBe(false);
            service.saveProject(project);
            expect(service.hasCurrentProject()).toBe(true);
        });
    });

    describe('getLibrary', () => {
        it('should return empty array when no projects exist', () => {
            expect(service.getLibrary()).toEqual([]);
        });

        it('should return project metadata from library', () => {
            const library = [
                { id: 'proj-1', name: 'Project 1', type: 'WEB_MOBILE', lastUpdated: '2024-01-01' },
                { id: 'proj-2', name: 'Project 2', type: 'GAME_2D', lastUpdated: '2024-01-02' }
            ];
            mockContext.globalState._store['devarchitect_projects_library'] = library;

            expect(service.getLibrary()).toEqual(library);
        });
    });

    describe('getProjectById', () => {
        it('should return null for non-existent project', () => {
            expect(service.getProjectById('non-existent')).toBeNull();
        });

        it('should return project data for existing project', () => {
            const storedProject = { ...sampleProjectData };
            mockContext.globalState._store[`devarchitect_project_data_${storedProject.id}`] = storedProject;

            const result = service.getProjectById(storedProject.id);
            
            expect(result).not.toBeNull();
            expect(result?.id).toBe(storedProject.id);
        });
    });

    describe('switchToProject', () => {
        it('should return null when switching to non-existent project', () => {
            expect(service.switchToProject('non-existent')).toBeNull();
        });

        it('should switch to existing project and return it', () => {
            const storedProject = { ...sampleProjectData, id: 'switch-target' };
            mockContext.globalState._store[`devarchitect_project_data_${storedProject.id}`] = storedProject;

            const result = service.switchToProject(storedProject.id);
            
            expect(result).not.toBeNull();
            expect(result?.id).toBe(storedProject.id);
        });
    });

    describe('deleteProject', () => {
        it('should remove project data from global state', () => {
            const projectId = 'to-delete';
            
            service.deleteProject(projectId);
            
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                `devarchitect_project_data_${projectId}`,
                undefined
            );
        });
    });

    // ========================================================================
    // Roadmap Phase Tests
    // ========================================================================

    describe('roadmap operations', () => {
        it('should save project with new phase', () => {
            const project = { ...sampleProjectData };
            const newPhase: DevBlock = {
                id: 'new-phase',
                title: 'New Phase',
                description: 'Description',
                status: 'todo',
                priority: 'Moyenne',
                progress: 0
            };
            
            project.roadmap = [...project.roadmap, newPhase];
            service.saveProject(project);
            
            const saved = service.getCurrentProject();
            expect(saved.roadmap.find(p => p.id === 'new-phase')).toBeDefined();
        });

        it('should update existing phase progress', () => {
            const project = { ...sampleProjectData };
            service.saveProject(project);
            
            const updatedProject = {
                ...project,
                roadmap: project.roadmap.map(p => 
                    p.id === 'phase-2' ? { ...p, progress: 75 } : p
                )
            };
            service.saveProject(updatedProject);
            
            const saved = service.getCurrentProject();
            const phase2 = saved.roadmap.find(p => p.id === 'phase-2');
            expect(phase2?.progress).toBe(75);
        });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================

    describe('edge cases', () => {
        it('should handle empty project name', () => {
            const project = { ...sampleProjectData, name: '' };
            service.saveProject(project);
            
            expect(service.getCurrentProject().name).toBe('');
        });

        it('should handle unicode characters', () => {
            const project = {
                ...sampleProjectData,
                name: '프로젝트 🚀 Проект',
                concept: '日本語テスト with émojis 🎉'
            };
            service.saveProject(project);
            
            const saved = service.getCurrentProject();
            expect(saved.name).toBe('프로젝트 🚀 Проект');
        });
    });
});
