# ZTNCUI Controller Validation Script for Windows
# PowerShell script to validate the luci-app-zerotier controller functionality

param(
    [switch]$CheckSyntax,
    [switch]$CheckTranslations,
    [switch]$CheckStructure,
    [switch]$All
)

Write-Host "=== ZTNCUI Controller Validation ===" -ForegroundColor Cyan

if ($All) {
    $CheckSyntax = $true
    $CheckTranslations = $true  
    $CheckStructure = $true
}

# Function to check JavaScript syntax
function Test-JavaScriptSyntax {
    param($FilePath)
    
    Write-Host "Checking JavaScript syntax for: $FilePath" -ForegroundColor Yellow
    
    # Check if Node.js is available
    $nodeAvailable = $false
    try {
        $nodeVersion = node --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            $nodeAvailable = $true
            Write-Host "Node.js detected: $nodeVersion" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "Node.js not available for syntax checking" -ForegroundColor Yellow
    }
    
    if ($nodeAvailable) {
        # Create temporary syntax check file
        $tempFile = [System.IO.Path]::GetTempFileName() + ".js"
        try {
            # Read the file content
            $content = Get-Content $FilePath -Raw -Encoding UTF8
            
            # Basic syntax check - wrap in try-catch
            $syntaxCheck = @"
try {
    $content
    console.log('SYNTAX_OK');
} catch (e) {
    console.log('SYNTAX_ERROR: ' + e.message);
    process.exit(1);
}
"@
            
            Set-Content $tempFile $syntaxCheck -Encoding UTF8
            $result = node $tempFile 2>&1
            
            if ($LASTEXITCODE -eq 0 -and $result -contains 'SYNTAX_OK') {
                Write-Host "✓ JavaScript syntax is valid" -ForegroundColor Green
                return $true
            } else {
                Write-Host "✗ JavaScript syntax error: $result" -ForegroundColor Red
                return $false
            }
        }
        finally {
            if (Test-Path $tempFile) {
                Remove-Item $tempFile -Force
            }
        }
    } else {
        # Manual basic checks
        $content = Get-Content $FilePath -Raw -Encoding UTF8
        $issues = @()
        
        # Check for basic syntax issues
        $openBraces = ($content -split '\{').Count - 1
        $closeBraces = ($content -split '\}').Count - 1
        if ($openBraces -ne $closeBraces) {
            $issues += "Mismatched curly braces: $openBraces open, $closeBraces close"
        }
        
        $openParens = ($content -split '\(').Count - 1
        $closeParens = ($content -split '\)').Count - 1
        if ($openParens -ne $closeParens) {
            $issues += "Mismatched parentheses: $openParens open, $closeParens close"
        }
        
        $openBrackets = ($content -split '\[').Count - 1
        $closeBrackets = ($content -split '\]').Count - 1
        if ($openBrackets -ne $closeBrackets) {
            $issues += "Mismatched square brackets: $openBrackets open, $closeBrackets close"
        }
        
        if ($issues.Count -eq 0) {
            Write-Host "✓ Basic syntax check passed" -ForegroundColor Green
            return $true
        } else {
            Write-Host "✗ Syntax issues found:" -ForegroundColor Red
            $issues | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
            return $false
        }
    }
}

# Function to check translation files
function Test-Translations {
    Write-Host "`nChecking translation files..." -ForegroundColor Yellow
    
    $translationPath = "po"
    if (Test-Path $translationPath) {
        $poFiles = Get-ChildItem $translationPath -Recurse -Filter "*.po"
        
        foreach ($poFile in $poFiles) {
            Write-Host "Checking: $($poFile.FullName)" -ForegroundColor Cyan
            
            $content = Get-Content $poFile.FullName -Encoding UTF8
            $msgidCount = ($content | Where-Object { $_ -match '^msgid\s+' }).Count
            $msgstrCount = ($content | Where-Object { $_ -match '^msgstr\s+' }).Count
            
            if ($msgidCount -eq $msgstrCount) {
                Write-Host "✓ Translation structure is valid ($msgidCount entries)" -ForegroundColor Green
            } else {
                Write-Host "✗ Translation mismatch: $msgidCount msgid, $msgstrCount msgstr" -ForegroundColor Red
            }
            
            # Check for untranslated strings
            $untranslated = $content | Select-String '^msgstr\s+""$'
            if ($untranslated.Count -gt 0) {
                Write-Host "⚠ Found $($untranslated.Count) untranslated strings" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "✗ Translation directory not found" -ForegroundColor Red
    }
}

# Function to check file structure
function Test-FileStructure {
    Write-Host "`nChecking file structure..." -ForegroundColor Yellow
    
    $expectedFiles = @(
        "htdocs/luci-static/resources/view/zerotier/controller.js",
        "root/usr/bin/ztncui-manager",
        "po/zh_Hans/zerotier.po",
        "po/zh_Hant/zerotier.po"
    )
    
    $allExist = $true
    foreach ($file in $expectedFiles) {
        if (Test-Path $file) {
            Write-Host "✓ $file exists" -ForegroundColor Green
        } else {
            Write-Host "✗ $file missing" -ForegroundColor Red
            $allExist = $false
        }
    }
    
    return $allExist
}

# Function to check for common issues
function Test-CommonIssues {
    Write-Host "`nChecking for common issues..." -ForegroundColor Yellow
    
    $controllerFile = "htdocs/luci-static/resources/view/zerotier/controller.js"
    if (Test-Path $controllerFile) {
        $content = Get-Content $controllerFile -Raw -Encoding UTF8
        
        # Check for Windows-specific path issues
        if ($content -match '/usr/bin/') {
            Write-Host "⚠ Found Unix paths - may not work on Windows environments" -ForegroundColor Yellow
        }
        
        # Check for proper error handling
        $catchBlocks = ($content -split 'catch\s*\(').Count - 1
        $promiseChains = ($content -split '\.then\s*\(').Count - 1
        
        if ($catchBlocks -lt ($promiseChains * 0.5)) {
            Write-Host "⚠ Insufficient error handling for promise chains" -ForegroundColor Yellow
        } else {
            Write-Host "✓ Good error handling coverage" -ForegroundColor Green
        }
        
        # Check for hardcoded values
        if ($content -match ':3000') {
            Write-Host "⚠ Hardcoded port 3000 found - consider making it configurable" -ForegroundColor Yellow
        }
        
        # Check for XSS protection
        if ($content -match 'innerHTML\s*=') {
            Write-Host "⚠ Direct innerHTML usage detected - potential XSS risk" -ForegroundColor Yellow
        } else {
            Write-Host "✓ No direct innerHTML usage found" -ForegroundColor Green
        }
    }
}

# Main execution
$overallSuccess = $true

if ($CheckSyntax -or $All) {
    $jsFiles = Get-ChildItem -Recurse -Filter "*.js" | Where-Object { $_.FullName -notmatch 'node_modules' }
    foreach ($jsFile in $jsFiles) {
        $result = Test-JavaScriptSyntax $jsFile.FullName
        if (-not $result) {
            $overallSuccess = $false
        }
    }
}

if ($CheckTranslations -or $All) {
    Test-Translations
}

if ($CheckStructure -or $All) {
    $result = Test-FileStructure
    if (-not $result) {
        $overallSuccess = $false
    }
}

if ($All) {
    Test-CommonIssues
}

Write-Host "`n=== Validation Complete ===" -ForegroundColor Cyan

if ($overallSuccess) {
    Write-Host "✓ All checks passed successfully!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "✗ Some issues were found. Please review the output above." -ForegroundColor Red
    exit 1
}