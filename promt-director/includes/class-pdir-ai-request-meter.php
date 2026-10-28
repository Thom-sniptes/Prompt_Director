<?php
if (!defined('ABSPATH')) { exit; }
/**
 * Optional per-generation OpenRouter request instrumentation.
 * Records ATTEMPTS at the application HTTP boundary (not provider billing).
 * One isolated counter per PHP request; never persists credentials, prompts,
 * token usage, or history. Disable with PDIR_AI_REQUEST_STATS_ENABLED=false.
 */
final class PDIR_AI_Request_Meter {
    private static $active=false;
    private static $counts=array('generation'=>0,'audit'=>0,'repair'=>0);

    public static function start() {
        self::$active=defined('PDIR_AI_REQUEST_STATS_ENABLED') && PDIR_AI_REQUEST_STATS_ENABLED;
        self::$counts=array('generation'=>0,'audit'=>0,'repair'=>0);
    }
    public static function record($stage) {
        if (!self::$active || !array_key_exists($stage,self::$counts)) return;
        self::$counts[$stage]++;
    }
    public static function finish() {
        $result=self::$active ? array(
            'generation'=>self::$counts['generation'],
            'audit'=>self::$counts['audit'],
            'repair'=>self::$counts['repair'],
            'total'=>array_sum(self::$counts),
        ) : null;
        self::$active=false;
        self::$counts=array('generation'=>0,'audit'=>0,'repair'=>0);
        return $result;
    }
}
