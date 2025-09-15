# LuCI ZeroTier Application - 开发者指南

## 开发环境设置

### 前置条件
- OpenWrt 开发环境或 SDK
- Node.js 14+ (用于开发工具)
- Git 版本控制
- 基本的 Shell 脚本知识

### 项目结构
```
luci-app-zerotier/
├── htdocs/luci-static/resources/view/zerotier/  # 前端视图文件
│   ├── config.js          # 主配置页面
│   ├── interface.js       # 接口信息页面
│   ├── moon.js           # Moon 节点管理
│   └── controller.js     # ZTNCUI 控制器管理
├── root/                 # 系统文件
│   ├── usr/bin/          # 可执行脚本
│   └── etc/              # 配置文件
├── po/                   # 国际化翻译文件
└── docs/                 # 文档目录
```

## 代码规范

### JavaScript 代码规范

#### 基本规则
1. 使用严格模式 `'use strict';`
2. 采用 ES5 语法确保兼容性
3. 使用 LuCI 框架提供的组件
4. 优先使用 Promise 进行异步处理

#### 命名规范
```javascript
// 常量使用大写字母和下划线
const ZEROTIER_CONFIG = {
    DEFAULT_PORT: 9993,
    MAX_NETWORKS: 100
};

// 函数使用驼峰命名
function getServiceStatus() {
    // 实现代码
}

// 私有方法使用下划线前缀
_logDebug: function(message, data) {
    // 实现代码
}
```

#### 错误处理
```javascript
// 标准 Promise 错误处理模式
someAsyncFunction()
    .then(function(result) {
        // 处理成功结果
        return processResult(result);
    })
    .catch(function(error) {
        // 记录错误
        self._logError('Operation failed', error);
        // 用户友好的错误提示
        ui.addNotification(null, E('p', {}, _('Operation failed: %s').format(error.message)), 'error');
        return null;
    });
```

#### UI 组件使用
```javascript
// 创建表单元素
var input = E('input', {
    type: 'text',
    class: 'cbi-input-text',
    placeholder: _('Enter value'),
    value: defaultValue
});

// 创建按钮
var button = E('button', {
    class: 'btn cbi-button cbi-button-apply',
    click: function() {
        // 处理点击事件
    }
}, _('Button Text'));
```

### Shell 脚本规范

#### 基本规则
1. 使用 `#!/bin/sh` shebang
2. 启用错误检查: `set -e`
3. 使用双引号包围变量
4. 提供详细的错误信息

#### 函数定义
```bash
# 标准函数格式
function_name() {
    local param1="$1"
    local param2="$2"
    
    # 参数验证
    if [ -z "$param1" ]; then
        echo "ERROR: Missing required parameter"
        return 1
    fi
    
    # 函数实现
    echo "SUCCESS: Operation completed"
    return 0
}
```

#### 错误处理
```bash
# 命令执行错误处理
if ! command_to_execute; then
    echo "ERROR: Command failed"
    exit 1
fi

# 使用 trap 进行清理
cleanup() {
    rm -f "$TEMP_FILE"
}
trap cleanup EXIT
```

## 组件开发指南

### 创建新的视图组件

1. **文件创建**
```javascript
/* SPDX-License-Identifier: GPL-3.0-only */
'use strict';
'require view';
'require form';

return view.extend({
    load: function() {
        // 数据加载逻辑
    },
    
    render: function(data) {
        // UI 渲染逻辑
    }
});
```

2. **数据加载**
```javascript
load: function() {
    return Promise.all([
        this.loadConfig(),
        this.loadStatus(),
        this.loadNetworks()
    ]).then(function(results) {
        return {
            config: results[0],
            status: results[1],
            networks: results[2]
        };
    });
}
```

3. **表单渲染**
```javascript
render: function(data) {
    var m = new form.Map('config_name', _('Page Title'));
    var s = m.section(form.NamedSection, 'global', 'section_type');
    
    var o = s.option(form.Value, 'option_name', _('Option Label'));
    o.datatype = 'string';
    o.rmempty = false;
    
    return m.render();
}
```

### 国际化支持

1. **翻译文件更新**
```bash
# 更新翻译模板
./scripts/po2lmo po/templates/zerotier.pot po/zh_Hans/zerotier.po

# 添加新的翻译条目
msgid "New Feature"
msgstr "新功能"
```

2. **代码中使用翻译**
```javascript
// 简单文本翻译
_('Text to translate')

// 带参数的翻译
_('Error: %s').format(errorMessage)

// 复数形式
n_('1 item', '%d items', count).format(count)
```

### RPC 接口开发

1. **服务定义**
```javascript
const callCustomService = rpc.declare({
    object: 'service_name',
    method: 'method_name',
    params: ['param1', 'param2'],
    expect: { result: '' }
});
```

2. **调用示例**
```javascript
callCustomService(param1, param2)
    .then(function(result) {
        // 处理结果
    })
    .catch(function(error) {
        // 处理错误
    });
```

## 测试指南

### 单元测试
```javascript
// 测试辅助函数
function testValidateConfig() {
    var config = { port: 3000 };
    var errors = this._validateConfig(config);
    console.assert(errors.length === 0, 'Valid config should have no errors');
}
```

### 集成测试
```bash
#!/bin/sh
# 测试脚本示例

test_service_start() {
    echo "Testing service start..."
    
    # 启动服务
    if ! /usr/bin/ztncui-manager start; then
        echo "FAIL: Service start failed"
        return 1
    fi
    
    # 验证服务状态
    sleep 2
    if [ "$(/usr/bin/ztncui-manager status)" != "RUNNING" ]; then
        echo "FAIL: Service not running after start"
        return 1
    fi
    
    echo "PASS: Service start test"
    return 0
}
```

### 浏览器测试
1. 在 OpenWrt 环境中安装应用
2. 通过 LuCI 界面测试所有功能
3. 检查浏览器控制台错误
4. 验证响应式设计

## 性能优化

### 前端优化
1. **延迟加载**: 按需加载大型组件
2. **缓存策略**: 缓存频繁访问的数据
3. **异步操作**: 避免阻塞 UI 线程
4. **DOM 优化**: 减少不必要的 DOM 操作

### 后端优化
1. **命令缓存**: 缓存系统命令结果
2. **批量操作**: 合并多个操作
3. **资源管理**: 及时清理临时资源
4. **错误处理**: 优雅降级处理

## 安全考虑

### 输入验证
```javascript
// 输入清理示例
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>&"']/g, function(match) {
        return {
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&#x27;'
        }[match];
    });
}
```

### 权限控制
```bash
# 检查权限示例
check_permissions() {
    if [ "$(id -u)" -ne 0 ]; then
        echo "ERROR: This operation requires root privileges"
        exit 1
    fi
}
```

### 安全配置
1. 最小权限原则
2. 输入验证和清理
3. 错误信息不泄露敏感信息
4. 使用安全的默认配置

## 部署和发布

### 构建流程
```bash
# 构建软件包
make package/luci-app-zerotier/compile V=s

# 验证软件包
opkg install luci-app-zerotier_*.ipk
```

### 版本管理
1. 遵循语义化版本控制
2. 维护详细的变更日志
3. 标记稳定版本
4. 向后兼容性考虑

### 发布检查清单
- [ ] 代码审查完成
- [ ] 所有测试通过
- [ ] 文档更新
- [ ] 翻译文件完整
- [ ] 性能测试通过
- [ ] 安全审计完成

## 故障排除

### 常见问题
1. **服务启动失败**: 检查依赖项和权限
2. **界面无响应**: 检查 JavaScript 错误
3. **配置丢失**: 验证 UCI 配置语法
4. **权限错误**: 检查文件权限和用户权限

### 调试技巧
1. 启用详细日志记录
2. 使用浏览器开发者工具
3. 检查系统日志
4. 单步调试复杂逻辑

### 日志分析
```bash
# 查看系统日志
logread | grep zerotier

# 查看服务状态
/etc/init.d/zerotier status

# 检查配置
uci show zerotier
```

## 贡献指南

### 提交代码
1. Fork 项目仓库
2. 创建功能分支
3. 提交代码和测试
4. 发起 Pull Request

### 代码审查
1. 代码风格检查
2. 功能测试验证
3. 安全性审查
4. 性能影响评估

### 社区参与
1. 报告问题和建议
2. 参与讨论和设计
3. 协助文档改进
4. 帮助用户解决问题

## 资源链接

- [LuCI 开发文档](https://openwrt.org/docs/guide-developer/luci)
- [OpenWrt 开发指南](https://openwrt.org/docs/guide-developer/start)
- [ZeroTier 官方文档](https://docs.zerotier.com/)
- [ZTNCUI 项目](https://github.com/key-networks/ztncui)

通过遵循这些指南，开发者可以有效地参与项目开发，确保代码质量和用户体验。