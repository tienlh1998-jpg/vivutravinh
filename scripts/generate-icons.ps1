Add-Type -AssemblyName System.Drawing

function Resize-Image($sourcePath, $destPath, $width, $height) {
    $src = [System.Drawing.Image]::FromFile($sourcePath)
    $dest = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($dest)
    
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    # Fill white background
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $graphics.FillRectangle($brush, 0, 0, $width, $height)
    $brush.Dispose()
    
    $graphics.DrawImage($src, 0, 0, $width, $height)
    
    $dest.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $graphics.Dispose()
    $dest.Dispose()
    $src.Dispose()
    Write-Host ("Generated $destPath ($width x $height)")
}

$base = "d:\OLD\VIVUTRAVINH_PROJECT_BACKUP\vivutravinh\icons"
$sym = Join-Path $base "logo-symbol.png"

Resize-Image -sourcePath $sym -destPath (Join-Path $base "favicon-32x32.png") -width 32 -height 32
Resize-Image -sourcePath $sym -destPath (Join-Path $base "apple-touch-icon.png") -width 180 -height 180
Resize-Image -sourcePath $sym -destPath (Join-Path $base "icon-192.png") -width 192 -height 192
Resize-Image -sourcePath $sym -destPath (Join-Path $base "icon-512.png") -width 512 -height 512
Resize-Image -sourcePath $sym -destPath (Join-Path $base "icon-maskable-192.png") -width 192 -height 192
Resize-Image -sourcePath $sym -destPath (Join-Path $base "icon-maskable-512.png") -width 512 -height 512
