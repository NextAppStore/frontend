import { defineStore } from 'pinia'
// Fallback-Fehlertexte werden hier über die globale i18n-Instanz
// übersetzt: Ein Store ist kein Setup-Kontext, ``useI18n()`` steht also
// nicht zur Verfügung. Dasselbe Muster nutzt ``router/index.ts``.
import i18n from '@/i18n'
import { courseApi } from '@/api/course.api'
import type { Course, CourseWithUsers, CourseCreate, CourseUpdate, User } from '@/types'
import { runRequest } from './_request'

export const useCourseStore = defineStore('course', {
  state: () => ({
    courses: [] as Course[],
    currentCourse: null as CourseWithUsers | null,
    // Sole source of truth for the detail page's roster — kept
    // separate from ``currentCourse.users`` so member mutations don't
    // need to refetch the whole course just to update the list.
    currentMembers: [] as User[],
    isLoading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchCourses() {
      const ctx = {
        setLoading: (v: boolean) => { this.isLoading = v },
        setError: (e: string | null) => { this.error = e },
      }
      await runRequest(ctx, async () => {
        const { data } = await courseApi.list()
        this.courses = data
      }, 'Failed to fetch courses', { rethrow: false })
    },

    async fetchCourseById(courseId: string) {
      const ctx = {
        setLoading: (v: boolean) => { this.isLoading = v },
        setError: (e: string | null) => { this.error = e },
      }
      await runRequest(ctx, async () => {
        const { data } = await courseApi.getById(courseId)
        this.currentCourse = data
        this.currentMembers = data.users ?? []
      }, 'Failed to fetch course')
    },

    async createCourse(data: CourseCreate) {
      const ctx = {
        setLoading: (v: boolean) => { this.isLoading = v },
        setError: (e: string | null) => { this.error = e },
      }
      return runRequest(ctx, async () => {
        const { data: course } = await courseApi.create(data)
        this.courses.push(course)
        return course
      }, 'Failed to create course')
    },

    async updateCourse(courseId: string, data: CourseUpdate) {
      const ctx = {
        setLoading: (v: boolean) => { this.isLoading = v },
        setError: (e: string | null) => { this.error = e },
      }
      return runRequest(ctx, async () => {
        const { data: course } = await courseApi.update(courseId, data)
        const index = this.courses.findIndex((c) => c.courseId === courseId)
        if (index !== -1) {
          this.courses[index] = course
        }
        if (this.currentCourse && this.currentCourse.courseId === courseId) {
          this.currentCourse = { ...this.currentCourse, ...course }
        }
        return course
      }, 'Failed to update course')
    },

    async deleteCourse(courseId: string) {
      const ctx = {
        setLoading: (v: boolean) => { this.isLoading = v },
        setError: (e: string | null) => { this.error = e },
      }
      await runRequest(ctx, async () => {
        await courseApi.delete(courseId)
        this.courses = this.courses.filter((c) => c.courseId !== courseId)
      }, 'Failed to delete course')
    },

    // --------------------------------------------------------------
    // MEMBERS
    // --------------------------------------------------------------
    async fetchMembers(courseId: string) {
      try {
        const { data } = await courseApi.listMembers(courseId)
        this.currentMembers = data
        return data
      } catch (err: any) {
        this.error = err.response?.data?.detail || i18n.global.t('errors.fetchMembers')
        throw err
      }
    },

    async addMembers(courseId: string, userIds: string[]) {
      try {
        const { data } = await courseApi.addMembers(courseId, userIds)
        this.currentMembers = data
        return data
      } catch (err: any) {
        this.error = err.response?.data?.detail || i18n.global.t('errors.addMembers')
        throw err
      }
    },

    async removeMember(courseId: string, userId: string) {
      try {
        await courseApi.removeMember(courseId, userId)
        this.currentMembers = this.currentMembers.filter((u) => u.userId !== userId)
      } catch (err: any) {
        this.error = err.response?.data?.detail || i18n.global.t('errors.removeMember')
        throw err
      }
    },
  },
})
