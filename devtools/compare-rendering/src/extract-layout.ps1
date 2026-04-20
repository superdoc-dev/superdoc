# extract-layout.ps1 — SuperDoc compare-rendering
#
# Reads $b64 (docx as base64) from the calling scope, decodes to a temp file,
# opens it in Word, and emits a JSON snapshot of resolved paragraph-level state
# between JSON_BEGIN / JSON_END markers. Tables/shapes/revisions short-circuit.
#
# Cache invalidation is automatic: word.ts hashes this file's bytes into the
# cache key, so any edit here busts the cache on the next run.

$ErrorActionPreference = 'Stop'
$word = $null
$doc = $null
$inputPath = "C:\word-mcp\compare-input-$([guid]::NewGuid().ToString('N')).docx"

try {
    [IO.File]::WriteAllBytes($inputPath, [Convert]::FromBase64String($b64))

    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0

    $doc = $word.Documents.Open($inputPath)
    [void]$doc.Fields.Update()
    try { $word.ActiveWindow.View.RevisionsView = 0 } catch {}

    # Short-circuit unsupported features
    $unsupported = $null
    if ($doc.Tables.Count -gt 0)        { $unsupported = "contains tables ($($doc.Tables.Count))" }
    elseif ($doc.InlineShapes.Count -gt 0) { $unsupported = "contains inline shapes ($($doc.InlineShapes.Count))" }
    elseif ($doc.Shapes.Count -gt 0)    { $unsupported = "contains floating shapes ($($doc.Shapes.Count))" }
    elseif ($doc.Revisions.Count -gt 0) { $unsupported = "contains tracked changes ($($doc.Revisions.Count))" }
    elseif ($doc.Comments.Count -gt 0)  { $unsupported = "contains comments ($($doc.Comments.Count))" }

    if ($unsupported) {
        $result = [ordered]@{
            supported         = $false
            unsupportedReason = $unsupported
            pageCount         = [int]$doc.ComputeStatistics(2)
            paragraphs        = @()
        }
        Write-Output "JSON_BEGIN"
        Write-Output ($result | ConvertTo-Json -Depth 25 -Compress)
        Write-Output "JSON_END"
        Write-Output "SUCCESS"
        return
    }

    $paragraphs = New-Object System.Collections.ArrayList
    $pIdx = 0
    foreach ($p in $doc.Paragraphs) {
        $pIdx++
        if ($p.Range.Information(12)) { continue }   # wdWithInTable (defensive; already short-circuited)

        $r = $p.Range
        $font = $r.Font
        $fmt = $p.Format
        $lf = $r.ListFormat

        $txt = $r.Text
        if ($txt) { $txt = $txt.TrimEnd([char]13, [char]7, [char]11) }

        $rgb = -16777216
        try { $rgb = [int]$font.TextColor.RGB } catch {}

        [void]$paragraphs.Add([ordered]@{
            idx             = $pIdx
            text            = $txt
            style           = $p.Style.NameLocal
            fontName        = $font.Name
            fontSize        = [double]$font.Size
            bold            = $font.Bold
            italic          = $font.Italic
            colorRgb        = $rgb
            alignment       = $fmt.Alignment
            leftIndent      = [double]$fmt.LeftIndent
            firstLineIndent = [double]$fmt.FirstLineIndent
            listString      = $lf.ListString
            listLevel       = $lf.ListLevelNumber
            page            = [int]$r.Information(1)
            y               = [double]$r.Information(6)
        })
    }

    $result = [ordered]@{
        supported  = $true
        pageCount  = [int]$doc.ComputeStatistics(2)
        paragraphs = $paragraphs
    }

    Write-Output "JSON_BEGIN"
    Write-Output ($result | ConvertTo-Json -Depth 25 -Compress)
    Write-Output "JSON_END"
    Write-Output "SUCCESS"
}
catch {
    Write-Output ("ERROR: " + $_.Exception.Message)
    Write-Output ("AT: " + $_.InvocationInfo.PositionMessage)
}
finally {
    if ($doc) { try { [void]$doc.Close(0) } catch {} }
    if ($word) { try { [void]$word.Quit(0) } catch {} }
    Remove-Item $inputPath -Force -ErrorAction SilentlyContinue
}
