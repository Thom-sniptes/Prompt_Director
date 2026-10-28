<?php
if (!defined('ABSPATH')) { exit; }
final class PDIR_Model_Registry {
    public static function keys() { return array_keys(PDIR_Catalog::profiles()); }
    public static function exists($key) { return is_string($key) && PDIR_Catalog::profile($key)!==null; }
    public static function default_key() { $keys=self::keys(); return in_array('flux',$keys,true)?'flux':($keys[0]??''); }
    public static function class_for($key) { return PDIR_Model_Catalog_Profile::use_key(self::exists($key)?$key:self::default_key()); }
    public static function profile($key) {
        $p=PDIR_Catalog::profile(self::exists($key)?$key:self::default_key());if(!$p){return array();}
        $p['next_review_on']=$p['reviewed_on'] ? gmdate('Y-m-d',strtotime($p['reviewed_on'].' UTC')+(int)$p['review_interval_days']*86400) : '';
        $p['review_due']=$p['next_review_on']==='' || $p['next_review_on']<=gmdate('Y-m-d');
        unset($p['prompt_rules'],$p['option_rules']);return $p;
    }
    public static function all_public() { $out=array();foreach(self::keys() as $key){$out[]=self::profile($key);}return $out; }
}
