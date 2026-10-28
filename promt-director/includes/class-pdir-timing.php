<?php
if (!defined('ABSPATH')) { exit; }
/** Deterministic shot timing. MMSS is interpreted as minutes and seconds, never frames. */
final class PDIR_Timing {
    public const FREEZE = 'ABSOLUTE FREEZE FRAME. Completely static image, zero motion, no morphing, no camera movement, no liquid dripping. The scene holds the exact final frame without any changes or alterations for the remainder of the video.';

    private static function seconds($value) {
        $value = str_replace(':', '', (string)$value);
        if (!preg_match('/^[0-9]{4}$/D', $value)) { return null; }
        $seconds = (int)substr($value, 2, 2);
        return $seconds < 60 ? ((int)substr($value, 0, 2) * 60 + $seconds) : null;
    }
    private static function timecode($total) {
        return sprintf('%02d:%02d', intdiv($total, 60), $total % 60);
    }
    /** Returns readable lines, including unchanged lines with no recognized prefix. */
    public static function parse($raw) {
        $items = array(); $last = null;
        foreach (preg_split('/\r\n|\r|\n/', (string)$raw) as $line) {
            $line = trim($line);
            if ($line === '') { continue; }
            // Only the beginning of a line qualifies as a timecode, avoiding prose digits.
            $pattern='/^\[?(?<first>[0-9]{2}:?[0-9]{2})(?:\s*-\s*(?<second>[0-9]{2}:?[0-9]{2}))?\]?\s+(?<action>.+)$/u';
            if (preg_match($pattern, $line, $m)) {
                $first=self::seconds($m['first']);
                $second=isset($m['second']) && $m['second']!=='' ? self::seconds($m['second']) : $first;
                if ($first !== null && $second !== null && $second >= $first) {
                    $tag='['.self::timecode($first).($second!==$first?' - '.self::timecode($second):'').']';
                    $items[]=array('tag'=>$tag,'start'=>$first,'end'=>$second,'action'=>trim($m['action']));
                    $last=$second;
                    continue;
                }
            }
            $items[]=array('tag'=>'','start'=>null,'end'=>null,'action'=>$line);
        }
        return array('items'=>$items,'last'=>$last);
    }
    public static function render($raw, $structured, $freeze, $translated_actions = null) {
        $parsed=self::parse($raw);
        if (!$parsed['items']) { return ''; }
        $lines=array();
        foreach ($parsed['items'] as $index => $item) {
            if (is_array($translated_actions) && isset($translated_actions[$index]) && is_string($translated_actions[$index]) && trim($translated_actions[$index])!=='') {
                $item['action']=trim($translated_actions[$index]);
            }
            if ($structured) {
                $lines[]=($item['tag']!=='' ? $item['tag'].' ' : '').$item['action'];
            } elseif ($item['start']!==null) {
                $prefix=$item['start']===$item['end'] ? 'At '.self::timecode($item['start']).': ' : 'From '.self::timecode($item['start']).' to '.self::timecode($item['end']).': ';
                $lines[]=$prefix.$item['action'];
            } else {
                $lines[]=$item['action'];
            }
        }
        if ($structured) { array_unshift($lines, '[TIMING & SEQUENCE]'); }
        if ($freeze && $parsed['last']!==null) {
            if (!$structured) { $lines=array(); }
            $lines[]='['.self::timecode($parsed['last']+1).'] '.self::FREEZE;
        }
        return implode("\n",$lines);
    }
    public static function plain($raw) {
        $parsed=self::parse($raw);
        return implode(' ', array_map(static function($item){if ($item['start']===null)return $item['action']; return ($item['start']===$item['end']?'At '.self::timecode($item['start']):'From '.self::timecode($item['start']).' to '.self::timecode($item['end'])).': '.$item['action'];},$parsed['items']));
    }
    /** Remove application-managed timing at the end without consuming any later content. */
    public static function without_managed_suffix($prompt) {
        $prompt=trim((string)$prompt);
        // Structured timeline is owned by this application. Require marker at a line boundary.
        $prompt=preg_replace('/\n+\[TIMING & SEQUENCE\]\n[^\x00]*$/u','',$prompt);
        // The unstructured mode only inserts one trailing canonical freeze line.
        $prompt=preg_replace('/\n+\[[0-9]{2}:[0-9]{2}\] ABSOLUTE FREEZE FRAME\.[^\n]*$/u','',$prompt);
        return trim((string)$prompt);
    }

    /** Strip the exact canonical timing tail produced for this shot, without touching body content. */
    public static function remove_appended($prompt,$shot,$translated_actions=null) {
        $prompt=(string)$prompt;
        if (!is_array($shot) || trim((string)($shot['duration']??''))==='') return trim($prompt);
        $structured=!empty($shot['timing_structured']);
        $freeze=!empty($shot['timing_freeze']);
        if (!$structured && !$freeze) return trim($prompt);
        if ($structured) {
            $suffix=self::render($shot['duration'],true,$freeze,$translated_actions);
        } else {
            $parsed=self::parse($shot['duration']);
            if ($parsed['last']===null) return trim($prompt);
            $suffix='['.self::timecode($parsed['last']+1).'] '.self::FREEZE;
        }
        $tail="\n\n".$suffix;
        if ($suffix!=='' && strlen($prompt)>=strlen($tail) && substr($prompt,-strlen($tail))===$tail) {
            return trim(substr($prompt,0,-strlen($tail)));
        }
        return trim($prompt);
    }

    /** Put managed timeline last. Never truncate any free text or preset instructions. */
    public static function append($prompt, $shot, $translated_actions = null, $strip_previous = true) {
        if (!is_array($shot)) { return $prompt; }
        $raw=trim((string)($shot['duration'] ?? ''));
        if ($raw==='') { return $prompt; }
        $structured=!empty($shot['timing_structured']);
        $freeze=!empty($shot['timing_freeze']);
        if (!$structured && !$freeze) { return $prompt; }
        if ($strip_previous) { $prompt=self::without_managed_suffix($prompt); }
        if ($structured) {
            $suffix=self::render($raw,true,$freeze,$translated_actions);
        } else {
            $parsed=self::parse($raw);
            if ($parsed['last']===null) { return $prompt; }
            $suffix='['.self::timecode($parsed['last']+1).'] '.self::FREEZE;
        }
        return rtrim($prompt)."\n\n".$suffix;
    }
}
