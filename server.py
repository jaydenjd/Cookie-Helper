from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import os
import json

# 设置模板文件夹路径
template_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'server', 'templates')
if not os.path.exists(template_dir):
    template_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates')

app = Flask(__name__, template_folder=template_dir)

# 数据库配置
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///cookies.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# 设置允许的token，实际应用中应该从环境变量或配置文件中读取
ALLOWED_TOKEN = os.getenv('COOKIE_HELPER_TOKEN', 'your-secret-token-here')

db = SQLAlchemy(app)

# Cookie记录模型
class CookieRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    url = db.Column(db.String(500), nullable=False)
    cookies = db.Column(db.Text, nullable=False)  # JSON字符串
    client_ip = db.Column(db.String(50), nullable=False)
    token = db.Column(db.String(200), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f'<CookieRecord {self.url}>'
    
    def to_dict(self):
        """将记录转换为字典格式"""
        try:
            cookies_data = json.loads(self.cookies) if self.cookies else []
        except:
            cookies_data = []
        
        return {
            'id': self.id,
            'url': self.url,
            'cookies': cookies_data,
            'client_ip': self.client_ip,
            'token': self.token,
            'is_valid_token': self.token == ALLOWED_TOKEN,
            'timestamp': self.timestamp.isoformat()
        }

# 请求日志模型
class RequestLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_ip = db.Column(db.String(50), nullable=False)
    token = db.Column(db.String(200), nullable=False)
    is_valid_token = db.Column(db.Boolean, nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f'<RequestLog {self.client_ip}>'

# 创建数据库表
with app.app_context():
    db.create_all()

@app.route('/')
def index():
    """主页路由，显示cookie记录列表"""
    try:
        # 获取筛选参数
        page = request.args.get('page', 1, type=int)
        url_filter = request.args.get('url', '')
        client_ip_filter = request.args.get('client_ip', '')
        is_valid_token_filter = request.args.get('is_valid_token', '')
        days_filter = request.args.get('days', '', type=str)
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        
        # 构建查询
        query = CookieRecord.query
        
        # 应用筛选条件
        if url_filter:
            query = query.filter(CookieRecord.url.contains(url_filter))
        
        if client_ip_filter:
            query = query.filter(CookieRecord.client_ip.contains(client_ip_filter))
        
        if is_valid_token_filter:
            if is_valid_token_filter == 'true':
                query = query.filter(CookieRecord.token == ALLOWED_TOKEN)
            elif is_valid_token_filter == 'false':
                query = query.filter(CookieRecord.token != ALLOWED_TOKEN)
        
        # 时间筛选
        if days_filter and days_filter.isdigit():
            days_ago = datetime.utcnow() - timedelta(days=int(days_filter))
            query = query.filter(CookieRecord.timestamp >= days_ago)
        elif start_date or end_date:
            if start_date:
                start_dt = datetime.strptime(start_date, '%Y-%m-%d')
                query = query.filter(CookieRecord.timestamp >= start_dt)
            if end_date:
                end_dt = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
                query = query.filter(CookieRecord.timestamp < end_dt)
        
        # 排序和分页
        query = query.order_by(CookieRecord.timestamp.desc())
        pagination = query.paginate(page=page, per_page=20, error_out=False)
        
        # 处理记录数据
        reports = []
        for record in pagination.items:
            report_data = record.to_dict()
            reports.append(report_data)
        
        # 构建筛选器数据
        filters = {
            'url': url_filter,
            'client_ip': client_ip_filter,
            'is_valid_token': is_valid_token_filter,
            'days': days_filter,
            'start_date': start_date,
            'end_date': end_date
        }
        
        # 构建分页数据
        pagination_data = {
            'current_page': page,
            'total_pages': pagination.pages,
            'total': pagination.total,
            'has_prev': pagination.has_prev,
            'has_next': pagination.has_next
        }
        
        return render_template('index.html', 
                             reports=reports, 
                             filters=filters, 
                             pagination=pagination_data)
    
    except Exception as e:
        return f"Error: {str(e)}", 500

@app.route('/api/cookies/<int:cookie_id>')
def get_cookie_details(cookie_id):
    """获取单个cookie记录的详情"""
    try:
        record = CookieRecord.query.get_or_404(cookie_id)
        return jsonify(record.to_dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cookies', methods=['GET'])
def get_cookies():
    """获取cookie记录列表"""
    try:
        # 获取查询参数
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)
        
        # 构建查询
        query = CookieRecord.query.order_by(CookieRecord.timestamp.desc())
        pagination = query.paginate(page=page, per_page=per_page, error_out=False)
        
        # 处理记录数据
        records = [record.to_dict() for record in pagination.items]
        
        return jsonify({
            'records': records,
            'pagination': {
                'current_page': page,
                'total_pages': pagination.pages,
                'total': pagination.total,
                'has_prev': pagination.has_prev,
                'has_next': pagination.has_next
            }
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cookies', methods=['POST'])
def receive_cookies():
    # 获取客户端IP
    client_ip = request.remote_addr
    if request.headers.get('X-Forwarded-For'):
        client_ip = request.headers['X-Forwarded-For'].split(',')[0]

    # 获取请求数据
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    # 验证必需字段
    required_fields = ['url', 'cookies', 'authorization']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400

    # 验证token
    token = data.get('authorization', '')
    is_valid_token = token == ALLOWED_TOKEN

    # 记录请求日志
    log = RequestLog(
        client_ip=client_ip,
        token=token,
        is_valid_token=is_valid_token
    )
    db.session.add(log)
    db.session.commit()

    # 如果token无效，返回错误
    if not is_valid_token:
        return jsonify({'error': 'Invalid token'}), 401

    try:
        # 保存Cookie记录
        record = CookieRecord(
            url=data['url'],
            cookies=json.dumps(data['cookies']),  # 将cookies列表转换为JSON字符串存储
            client_ip=client_ip,
            token=token
        )
        db.session.add(record)
        db.session.commit()

        return jsonify({
            'status': 'success',
            'message': 'Cookies recorded successfully'
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': 'Failed to save record',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True) 