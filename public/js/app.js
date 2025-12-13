// Physics Hub 前端应用逻辑

class PhysicsHubApp {
    constructor() {
        this.API_BASE_URL = 'http://10.129.240.154:3000/api';
        this.app = {
            user: null,
            token: localStorage.getItem('authToken'),
            isTA: false,
            isAnonPosting: true,
            currentTab: 'forum',
            activeCourseId: null,
            courses: [],
            posts: [],
            comments: {},
            currentPage: 1,
            postsPerPage: 20,
            postFilter: 'Question'
        };
        
        this.init();
    }

    async init() {
        await this.checkAuth();
        this.setupEventListeners();
        
        if (this.app.token) {
            await this.loadInitialData();
            this.showAppContent();
        } else {
            this.showLoginScreen();
        }
    }

    async checkAuth() {
        if (!this.app.token) return;
        
        try {
            const data = await this.apiCall('/auth/profile');
            if (data.success) {
                this.app.user = data.user;
                this.app.isTA = data.user.role === 'ta';
            }
        } catch (error) {
            console.error('验证登录状态失败:', error);
            this.logout();
        }
    }

    async apiCall(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        if (this.app.token) {
            headers['Authorization'] = `Bearer ${this.app.token}`;
        }
        
        try {
            const response = await fetch(`${this.API_BASE_URL}${endpoint}`, {
                ...options,
                headers
            });
            
            if (response.status === 401) {
                this.logout();
                throw new Error('登录已过期，请重新登录');
            }
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || '请求失败');
            }
            
            return data;
        } catch (error) {
            console.error('API调用错误:', error);
            throw error;
        }
    }

    async login(userId, password) {
        try {
            const data = await this.apiCall('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ userId, password })
            });
            
            if (data.success) {
                this.app.token = data.token;
                this.app.user = data.user;
                this.app.isTA = data.user.role === 'ta';
                localStorage.setItem('authToken', data.token);
                
                await this.loadInitialData();
                this.showAppContent();
                
                return true;
            }
            return false;
        } catch (error) {
            throw error;
        }
    }

    logout() {
        this.app.token = null;
        this.app.user = null;
        this.app.isTA = false;
        localStorage.removeItem('authToken');
        this.showLoginScreen();
    }

    async loadInitialData() {
        try {
            // 加载课程
            const coursesData = await this.apiCall('/courses');
            this.app.courses = coursesData.courses;
            
            // 设置默认课程
            if (this.app.courses.length > 0 && !this.app.activeCourseId) {
                this.app.activeCourseId = this.app.courses[0].id;
            }
            
            // 加载帖子
            await this.loadPosts();
            
        } catch (error) {
            console.error('加载初始数据失败:', error);
            this.showError('加载数据失败: ' + error.message);
        }
    }

    async loadPosts() {
        if (!this.app.activeCourseId && !this.app.isTA) return;
        
        try {
            const params = new URLSearchParams({
                page: this.app.currentPage,
                limit: this.app.postsPerPage
            });
            
            if (this.app.activeCourseId) {
                params.append('courseId', this.app.activeCourseId);
            }
            
            if (this.app.postFilter && this.app.postFilter !== 'All') {
                params.append('type', this.app.postFilter);
            }
            
            const data = await this.apiCall(`/posts?${params}`);
            this.app.posts = data.posts;
            
            this.renderPosts();
            
        } catch (error) {
            console.error('加载帖子失败:', error);
            this.showError('加载帖子失败: ' + error.message);
        }
    }

    // 其他方法：renderPosts, setupEventListeners, showAppContent, showLoginScreen 等
    // 需要将原Firebase相关的渲染逻辑适配到新的API
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    window.physicsHubApp = new PhysicsHubApp();
});