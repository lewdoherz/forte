-- ---------------------------------------------------------------------------
-- 0017_exercise_translations_zh.sql — Simplified Chinese for the exercise catalog
--
-- The catalog itself is English: 24 curated rows in 0005 and 452 imported rows in
-- 0011. This migration adds the Chinese title and instructions for every one of
-- them, so a reader of Chinese sees the catalog in Chinese rather than a
-- translated interface wrapped around English movement names.
--
-- Written by hand (per shard, then reviewed) rather than generated: unlike 0011,
-- there is no input directory to re-import from — a translation is not derivable
-- from the English source, so this file IS the source for the Chinese catalog.
-- Do not "regenerate" it by re-running scripts/import-exercises.ts, which rewrites
-- only the English columns.
--
-- Conventions:
-- - Every statement is a dollar-quoted update keyed on the stable `slug`, so the
--   instruction bodies keep their newlines and apostrophes without escaping.
--   `$zh$` is the only tag used anywhere in this file.
-- - Instructions mirror the English body step for step, same order, same count.
--   Their numbering stays `1. `, `2. ` — unchanged between languages.
-- - 15 rows have no instructions at all in English (curated entries with no source
--   text), so they receive a title only; `how_to_zh` stays null and the renderer
--   falls back to English, which is also null there.
-- - Custom exercises (is_custom) are never touched: they belong to a reader who
--   wrote them, and `lib/i18n/content.ts` falls back to their own title.
--
-- Idempotent: plain updates keyed on slug, so re-applying changes nothing.
--
-- The trailing guard makes an incomplete translation fail loudly at migration
-- time instead of silently rendering English inside a Chinese interface. It is
-- why this file must list every catalog row: a missing slug would otherwise be
-- invisible.
-- ---------------------------------------------------------------------------

begin;
-- 0017 fragment 01 — bench-press .. behind-the-back-curl-cable
update exercise_template
   set title_zh = $zh$卧推$zh$
 where slug = 'bench-press';

update exercise_template
   set title_zh = $zh$上斜哑铃卧推$zh$
 where slug = 'incline-dumbbell-press';

update exercise_template
   set title_zh = $zh$俯卧撑$zh$,
       how_to_zh = $zh$1. 四肢着地。
2. 伸展身体进入俯卧撑姿势。双手平放于地面，指尖略微朝外，肩胛骨后收。
3. 双腿伸直，脚尖支撑下半身。脚踝、膝盖、髋部和肩部应保持一条直线。
4. 吸气，弯曲手肘使身体下降。
5. 尽可能降低身体，理想情况下脸部距地面一两英寸。
6. 在最低点稍作停留，呼气并将身体推回起始位置。
$zh$
 where slug = 'push-up';

update exercise_template
   set title_zh = $zh$绳索飞鸟$zh$
 where slug = 'cable-fly';

update exercise_template
   set title_zh = $zh$杠铃划船$zh$
 where slug = 'barbell-row';

update exercise_template
   set title_zh = $zh$引体向上$zh$,
       how_to_zh = $zh$1. 站在引体向上杆下方。
2. 向上伸手，以正握（掌心朝前）均匀握住横杆，双手间距略宽于肩。
3. 肩部后收，收紧腹部。
4. 屈膝抬脚离地，悬垂于横杆上。
5. 吸气，弯曲手肘将身体向上拉起。
6. 尽可能向上，理想情况下下巴超过横杆。呼气。
7. 伸展手肘缓慢下降，下降过程中吸气。
$zh$
 where slug = 'pull-up';

update exercise_template
   set title_zh = $zh$高位下拉$zh$
 where slug = 'lat-pulldown';

update exercise_template
   set title_zh = $zh$硬拉$zh$
 where slug = 'deadlift';

update exercise_template
   set title_zh = $zh$杠铃颈后深蹲$zh$
 where slug = 'back-squat';

update exercise_template
   set title_zh = $zh$腿举$zh$
 where slug = 'leg-press';

update exercise_template
   set title_zh = $zh$罗马尼亚硬拉$zh$
 where slug = 'romanian-deadlift';

update exercise_template
   set title_zh = $zh$腿弯举$zh$
 where slug = 'leg-curl';

update exercise_template
   set title_zh = $zh$站姿提踵$zh$,
       how_to_zh = $zh$1. 站直，双脚并拢，膝盖伸直，肩部后收，双臂自然垂于体侧。
2. 吸气。
3. 以前脚掌发力伸展脚踝，将身体抬起几英寸。呼气。
4. 吸气，回到起始位置。
$zh$
 where slug = 'standing-calf-raise';

update exercise_template
   set title_zh = $zh$过头推举$zh$
 where slug = 'overhead-press';

update exercise_template
   set title_zh = $zh$侧平举$zh$
 where slug = 'lateral-raise';

update exercise_template
   set title_zh = $zh$面拉$zh$,
       how_to_zh = $zh$1. 选择较轻的重量，将滑轮调到高位，并装上绳索。
2. 拇指朝上握住绳索。
3. 后退一步将重量从配重片拉起，肩部后收，前后错开站位以获得额外支撑。
4. 吸气，将绳索拉向面部，双臂向两侧分开。呼气。
5. 吸气并伸展手臂。
$zh$
 where slug = 'face-pull';

update exercise_template
   set title_zh = $zh$杠铃弯举$zh$
 where slug = 'barbell-curl';

update exercise_template
   set title_zh = $zh$肱三头肌下压$zh$,
       how_to_zh = $zh$1. 选择合适的重量，将滑轮调到最高位置，并装上横杆。
2. 以正握均匀握住横杆，手肘贴近体侧。
3. 后退几步，躯干略微前倾。
4. 收紧腹部，肩胛骨后收，吸气。
5. 保持手肘贴近体侧伸展手臂，稍作停留。呼气。
6. 缓慢弯曲手臂，直到手腕略高于手肘。弯曲时吸气。
$zh$
 where slug = 'triceps-pushdown';

update exercise_template
   set title_zh = $zh$平板支撑$zh$,
       how_to_zh = $zh$1. 俯身趴在地面上。
2. 伸展身体，脚尖支撑下半身，前臂支撑上半身。
3. 肩部保持中立，收紧腹部。
4. 尽可能长时间保持该姿势，同时保持均匀呼吸。
$zh$
 where slug = 'plank';

update exercise_template
   set title_zh = $zh$卷腹$zh$,
       how_to_zh = $zh$1. 仰卧于地面，屈膝，双脚平放地面。
2. 抬起双臂，指尖置于脑后。
3. 收紧腹部，吸气。
4. 弯曲躯干做卷腹，将肩胛骨抬离地面几英寸。在最高点呼气。
5. 缓慢下降并吸气。
$zh$
 where slug = 'crunch';

update exercise_template
   set title_zh = $zh$臀推$zh$,
       how_to_zh = $zh$1. 坐在地面上，上背靠在长凳边缘。
2. 弯曲手臂，双手置于胸前。
3. 屈膝，双脚平放地面。膝盖应朝向正前方，而非两侧。
4. 肩部后收，吸气。
5. 收紧臀部，以脚跟发力将臀部抬起，直到髋部与肩部对齐。
6. 保持收缩片刻并呼气。
7. 吸气，将臀部放回地面。
$zh$
 where slug = 'hip-thrust';

update exercise_template
   set title_zh = $zh$行走弓步$zh$,
       how_to_zh = $zh$1. 肩胛骨后收，收紧腹部。
2. 吸气，右腿向前迈出，脚掌踩实地面。
3. 立即下蹲成弓步，直到后侧膝盖几乎接触地面。
4. 呼气，以前脚发力伸直腿部。
5. 吸气，将后脚抬离地面并向前迈出，脚掌落在身体前方，再次下蹲成弓步。
6. 持续向前行进直至完成。
$zh$
 where slug = 'walking-lunge';

update exercise_template
   set title_zh = $zh$高脚杯深蹲$zh$,
       how_to_zh = $zh$1. 双手握住一只哑铃，保持竖直（一侧朝上），举于躯干前方。
2. 双手置于哑铃两侧，掌心紧贴上方配重片。
3. 挺直背部，收紧腹部，吸气。
4. 保持躯干直立下蹲。
5. 在舒适范围内尽可能下蹲，理想情况下大腿与地面平行。
6. 以脚跟发力回到起始位置，在动作顶端附近呼气。
$zh$
 where slug = 'goblet-squat';

update exercise_template
   set title_zh = $zh$农夫行走$zh$
 where slug = 'farmers-carry';

update exercise_template
   set title_zh = $zh$21s 肱二头肌弯举$zh$,
       how_to_zh = $zh$1. 均匀握住直杆或曲杆，站直。肩部后收，夹紧臀部，吸气。
2. 将重量弯举到一半（手腕与手肘齐平）做七次。
3. 随即从半程位置继续弯举到顶端（手腕高于手肘几英寸），再做七次。
4. 最后从手臂完全伸展到顶端位置做七次完整动作，过程中保持均匀呼吸。
$zh$
 where slug = '21s-bicep-curl';

update exercise_template
   set title_zh = $zh$剪刀腿$zh$,
       how_to_zh = $zh$1. 坐在训练垫上，身体后仰，双手撑于身体两侧地面以保持平衡。
2. 收紧腹部，保持膝盖伸直将双脚抬离地面几英寸。
3. 吸气，右腿交叉到左腿上方。随即分开，再将左腿交叉到右腿上方。
4. 持续交替直至疲劳，过程中保持均匀呼吸。
$zh$
 where slug = 'ab-scissors';

update exercise_template
   set title_zh = $zh$健腹轮$zh$,
       how_to_zh = $zh$1. 双手握住健腹轮，跪于地面。
2. 身体前倾，双手紧握健腹轮置于地面。
3. 收紧腹部，吸气。
4. 向前滚动健腹轮，同时伸展身体。
5. 在腹部力量允许的范围内尽可能向前，然后将健腹轮滚回起始位置。呼气。
$zh$
 where slug = 'ab-wheel';

update exercise_template
   set title_zh = $zh$有氧操$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）$zh$
 where slug = 'aerobics';

update exercise_template
   set title_zh = $zh$风阻单车$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）$zh$
 where slug = 'air-bike';

update exercise_template
   set title_zh = $zh$哑铃阿诺德推举$zh$,
       how_to_zh = $zh$1. 拿起一对轻哑铃，坐在靠背直立训练凳上。
2. 举起哑铃，放在大腿上。
3. 肩部后收，收紧腹部，吸气。
4. 将哑铃向上提起，置于身体两侧。
5. 吸气，呼气时将哑铃推至头顶位置。
6. 缓慢放下哑铃，同时手腕内旋，下降过程中吸气。最终哑铃应位于下巴前方，掌心朝向身体。
7. 再次推起，同时旋转手腕，以掌心朝前完成这次动作。
$zh$
 where slug = 'arnold-press-dumbbell';

update exercise_template
   set title_zh = $zh$环球飞鸟$zh$,
       how_to_zh = $zh$1. 仰卧于平板凳上，双手各持一只哑铃。
2. 手臂伸直，掌心朝下，将哑铃置于大腿上方。
3. 肩部后收，收紧腹部，吸气。
4. 保持手臂伸直，将哑铃以弧线动作从大腿上方缓慢移至头后。呼气。
5. 吸气，随即以弧线将哑铃从头后移回起始位置。过程中转动手腕，使掌心在起始位置朝下。
$zh$
 where slug = 'around-the-world';

update exercise_template
   set title_zh = $zh$辅助手枪深蹲$zh$,
       how_to_zh = $zh$1. 站在深蹲架旁，单手扶架保持平衡。
2. 抬起一只脚离地，向前抬起几英寸。另一只脚牢牢踩实地面。
3. 收紧腹部，肩部后收，吸气。
4. 屈膝下蹲，同时另一条腿向前移动，脚保持离地。
5. 尽可能下蹲，呼气时以脚跟发力起身。
6. 一条腿训练完成后，换另一只脚支撑，完成相同次数的动作。
$zh$
 where slug = 'assisted-pistol-squats';

update exercise_template
   set title_zh = $zh$山羊挺身$zh$,
       how_to_zh = $zh$1. 在背部伸展器械上就位。髋部和大腿贴紧靠垫，脚踝卡在脚托上。
2. 收紧腹部，双臂交叉于胸前，吸气。
3. 以髋部屈曲使身体下降，直到腘绳肌和臀部有拉伸感。
4. 收紧臀部和下背将躯干抬起至最高位置，稍作停留并呼气。
$zh$
 where slug = 'back-extension-hyperextension';

update exercise_template
   set title_zh = $zh$固定器械山羊挺身$zh$,
       how_to_zh = $zh$1. 坐在背部伸展器械上，臀部贴紧靠垫。
2. 将脚垫压在脚上方。
3. 上方靠垫应抵住上背。
4. 调整器械重量，双臂交叉于胸前。
5. 吸气，收紧腹部，以下背肌群发力将上方靠垫向后推。呼气。
6. 吸气，前倾回到起始位置。
$zh$
 where slug = 'back-extension-machine';

update exercise_template
   set title_zh = $zh$负重山羊挺身$zh$,
       how_to_zh = $zh$1. 在背部伸展凳上就位。脚跟卡紧靠垫，髋部贴紧另一块靠垫。
2. 身体前倾，从地面拿起杠铃片，或让训练伙伴递给你。
3. 伸展身体，吸气。
4. 以髋部屈曲身体，同时保持肩部后收、脊柱中立。在肌肉柔韧性允许的范围内尽可能下降。
5. 以后侧链发力伸展身体，在接近最高点呼气。
$zh$
 where slug = 'back-extension-weighted-hyperextension';

update exercise_template
   set title_zh = $zh$药球砸地$zh$,
       how_to_zh = $zh$1. 站直，双脚以舒适的站距分开，脚尖略微朝外。
2. 双手持药球，置于腹部高度。
3. 收紧核心，略微屈膝，将药球举过头顶。手臂应伸直，药球位于头顶正上方以保持平衡。
4. 吸气，以上肢肌肉发力加快下砸，在身体正前方用尽全力将球砸向地面。呼气。
5. 保持脊柱中立，屈膝拾起药球。
6. 吸气，重复以上流程。
$zh$
 where slug = 'ball-slams';

update exercise_template
   set title_zh = $zh$弹力带拉开$zh$,
       how_to_zh = $zh$1. 握住环形或两端带把手的开口弹力带。弹力带应提供中等阻力。
2. 双臂在身体前方伸直，掌心相对（中立握）。
3. 吸气，将弹力带向两侧拉开，手臂保持伸直移至身体两侧。呼气。
4. 吸气，将双臂合拢。
$zh$
 where slug = 'band-pullaparts';

update exercise_template
   set title_zh = $zh$战绳$zh$,
       how_to_zh = $zh$1. 双手各握住一根战绳。
2. 屈膝，略微前倾，同时保持脊柱中立。
3. 吸气，一只手臂抬至肩部高度，另一只手臂下压至膝盖位置。
4. 随即双臂反向移动，交换位置。
5. 以稳定的节奏交替摆动双臂，过程中保持规律呼吸。
6. 尽可能长时间坚持，直到上背和肩部出现强烈灼烧感。
$zh$
 where slug = 'battle-ropes';

update exercise_template
   set title_zh = $zh$熊爬$zh$,
       how_to_zh = $zh$1. 俯身跪地，双手撑地。双手间距与肩同宽。
2. 收紧腹部，将膝盖抬离地面。
3. 吸气，双手双脚向前移动，膝盖保持离地。
4. 右臂与左膝向前移动，然后左臂与右膝向前移动。
5. 持续交替向前移动，保持均匀呼吸。
$zh$
 where slug = 'bear-crawl';

update exercise_template
   set title_zh = $zh$绳索背后弯举$zh$,
       how_to_zh = $zh$1. 将滑轮调至大腿中部高度，装上把手，并选择重量。
2. 依次握住把手，站位使滑轮位于身后。
3. 向前走几步将重量从配重片拉起，让重量将手肘拉向躯干后方。
4. 挺胸，躯干略微前倾，前后错开站位（一只脚在前，另一只脚在后）。
5. 吸气，收紧腹部，弯举至手腕与手肘同高。挤压肱二头肌并呼气。
6. 缓慢伸展手臂，让把手移向身体后方，同时吸气。
7. 重复。
$zh$
 where slug = 'behind-the-back-curl-cable';

-- 0017 fragment 02 — behind-the-back-wrist-curl-barbell .. chest-dip-assisted
update exercise_template
   set title_zh = $zh$杠铃背后腕弯举$zh$,
       how_to_zh = $zh$1. 将装有杠铃片的杠铃或 EZ 杠放在地上，站在其前方。
2. 双臂垂于体侧，掌心朝后，下蹲并均匀握住杠铃。保持背部挺直。
3. 脚跟发力蹲起，将杠铃提至身后。
4. 吸气，屈腕向上弯举杠铃，肘部和手臂保持不动。在顶端呼气。
5. 吸气，同时伸展手腕。
$zh$
 where slug = 'behind-the-back-wrist-curl-barbell';

update exercise_template
   set title_zh = $zh$固定器械腰带深蹲$zh$,
       how_to_zh = $zh$1. 为器械加上合适的重量，并系好负重腰带。
2. 站上踏板，用登山扣将腰带的链条挂到器械的杠杆上。
3. 站直，握住前方的把手或横杆。
4. 双脚以舒适的宽度站开，脚尖略微外展，呈深蹲站姿。
5. 挺胸，收紧腹部，解开重量。可以扶住身前的横杆或把手保持平衡。
6. 吸气下蹲，直到大腿大致与杠平行。
7. 稍作停顿，脚跟发力伸直膝盖，在顶端呼气。
8. 吸气，重复动作。
$zh$
 where slug = 'belt-squat-machine';

update exercise_template
   set title_zh = $zh$长凳臂屈伸$zh$,
       how_to_zh = $zh$1. 背对稳固的训练凳、跳箱或椅子。
2. 后仰，双手平放在物体边缘。
3. 伸直双腿，用脚跟支撑下半身。躯干保持直立。
4. 收紧腹部，吸气，屈肘下降。
5. 下降至肘部呈 90 度角，稍作停顿。
6. 伸直手臂，在接近顶端时呼气。
$zh$
 where slug = 'bench-dip';

update exercise_template
   set title_zh = $zh$杠铃卧推$zh$,
       how_to_zh = $zh$1. 仰卧在平板凳上。
2. 伸直手臂，双手略宽于肩，均匀握住杠铃。
3. 肩胛骨后收，抵住凳面。
4. 下背略拱起，双脚平踩地面。
5. 吸气，解开杠铃，将其移至胸部上方。
6. 再次吸气，将杠铃下放至下胸，轻轻触碰。
7. 停顿片刻，推起杠铃直至手臂伸直。呼气。
$zh$
 where slug = 'bench-press-barbell';

update exercise_template
   set title_zh = $zh$绳索卧推$zh$,
       how_to_zh = $zh$1. 将平板凳放在双柱绳索器械中间。
2. 调整两侧配重片的重量，将滑轮调至低位并装上把手。
3. 握住两个把手坐在凳上，手臂贴近身体。
4. 小心后仰躺下，双臂移至体侧，肘部不要外展。
5. 肩部后收，收紧腹部，吸气。
6. 将两个把手向上向内推，在顶端双手相触时呼气。
7. 缓慢下放重量，直到肘部与躯干同高，同时吸气。
8. 完成后收拢手臂，慢慢起身，松开两个把手。
$zh$
 where slug = 'bench-press-cable';

update exercise_template
   set title_zh = $zh$窄握杠铃卧推$zh$,
       how_to_zh = $zh$1. 将杠铃架设在仰卧时能够到的高度。
2. 仰卧在凳上，头部位于杠铃下方。
3. 向上伸手，以正握均匀握住杠铃。双手应与肩同宽。
4. 肩胛骨后收，双脚向凳的方向收拢，前脚掌踩实地面。
5. 绷紧身体，解开杠铃，将其移至胸部上方。
6. 吸气，将杠铃下放至下胸。
7. 将杠铃推至顶端位置，呼气。
8. 完成后，将杠铃移至架子上方并轻轻放下。
$zh$
 where slug = 'bench-press-close-grip-barbell';

update exercise_template
   set title_zh = $zh$哑铃卧推$zh$,
       how_to_zh = $zh$1. 拿一对哑铃，坐在平板凳上，将哑铃放在大腿上方。
2. 肩部后收，收紧腹部，吸气，屈臂。
3. 后仰躺下的同时，用大腿将两个哑铃向上顶起。
4. 手臂伸直，哑铃位于胸部上方，肩胛骨抵住凳面，双脚平踩地面。
5. 再次吸气，将两个哑铃下放至体侧。肘部稍微内收。
6. 继续下放，直到肘部与躯干同高。
7. 将两个哑铃推回起始位置，靠拢时呼气。
$zh$
 where slug = 'bench-press-dumbbell';

update exercise_template
   set title_zh = $zh$史密斯机卧推$zh$,
       how_to_zh = $zh$1. 将平板凳放在史密斯机中间。
2. 将杠铃调到仰卧时能握住并解开的高度。
3. 仰卧在凳上，下胸位于杠铃正下方。
4. 以正握均匀握住杠铃。
5. 肩部后收，前脚掌踩实地面。
6. 吸气，解开杠铃。
7. 下放杠铃至轻触胸部，再推至顶端，同时呼气。
$zh$
 where slug = 'bench-press-smith-machine';

update exercise_template
   set title_zh = $zh$宽握杠铃卧推$zh$,
       how_to_zh = $zh$1. 将杠铃架设在仰卧时能握住的高度。
2. 仰卧在凳上，使杠铃位于额头正上方。
3. 向上伸手，以正握握住杠铃。双手先从与肩同宽开始，再逐渐加宽握距。
4. 肩胛骨后收，抵住凳面。
5. 双脚向凳的方向收拢，前脚掌踩实地面。
6. 绷紧上半身，解开杠铃，将其移至胸部上方。
7. 吸气，将杠铃下放到底（下胸、乳头连线处）。
8. 轻触躯干后将杠铃推回顶端，收紧肱三头肌、肩部和胸肌。接近顶端时呼气。
9. 完成后，将杠铃移回安全挂钩上方并放回架上。
$zh$
 where slug = 'bench-press-wide-grip-barbell';

update exercise_template
   set title_zh = $zh$弹力带俯身划船$zh$,
       how_to_zh = $zh$1. 取一条两端带把手的开口弹力带。
2. 双脚踩住弹力带中间。
3. 握住两个把手，保持脊柱中立并前倾。即使手臂完全伸直，弹力带也应保留一定张力。双脚靠拢或分开可增加或减小张力。
4. 肩部后收，吸气。
5. 将弹力带两端向上向内拉，直到肘部与躯干同高。在顶端呼气。
6. 吸气，同时伸直手臂。
$zh$
 where slug = 'bent-over-row-band';

update exercise_template
   set title_zh = $zh$杠铃俯身划船$zh$,
       how_to_zh = $zh$1. 站在装有杠铃片的杠铃前，双脚以舒适的宽度站开，脚尖略微外展。
2. 以髋部为轴前倾，保持脊柱中立。
3. 以正握均匀握住杠铃。
4. 收紧腹部，将杠铃提离地面数英寸。
5. 肩部后收、核心绷紧，吸气并划船。
6. 将杠铃拉至轻触腹部，保持姿势片刻并呼气。
7. 缓慢下放杠铃。
$zh$
 where slug = 'bent-over-row-barbell';

update exercise_template
   set title_zh = $zh$哑铃俯身划船$zh$,
       how_to_zh = $zh$1. 拿一对哑铃站直。
2. 肩部后收，收紧腹部，保持背部挺直前倾。躯干尽量与地面平行。
3. 手臂伸直自然下垂，手腕保持中立（相对）。
4. 吸气，将两个哑铃划起，直到肘部与躯干同高。在顶端呼气。
5. 下放哑铃，下放过程中吸气。
$zh$
 where slug = 'bent-over-row-dumbbell';

update exercise_template
   set title_zh = $zh$史密斯机俯身划船$zh$,
       how_to_zh = $zh$1. 将杠铃调到大腿中部高度并加上重量。
2. 靠近杠铃站立，大腿几乎贴住它。双脚与髋同宽。
3. 以正握握住杠铃，掌心朝后。双手大致与肩同宽。
4. 吸气，收紧腹部，解开杠铃。
5. 上身前倾、臀部后推，将杠铃下放至小腿中部高度。脊柱保持中立。
6. 再次吸气，保持躯干角度不变，流畅地将杠铃拉起。
7. 在顶端呼气，同时收紧背部肌肉。
8. 缓慢下放杠铃直到手臂伸直，下放过程中吸气。
9. 重复动作。
$zh$
 where slug = 'bent-over-row-smith-machine';

update exercise_template
   set title_zh = $zh$杠铃肱二头肌弯举$zh$,
       how_to_zh = $zh$1. 拿起杠铃，握距略宽于髋部。手臂伸直，掌心朝前。
2. 挺直背部，挺胸，吸气并弯举杠铃，在顶端呼气。不要靠身体摆动和惯性抬起杠铃，只靠肱二头肌发力。
3. 吸气，缓慢下放杠铃，伸直手臂并拉伸肱二头肌。
4. 重复动作。
$zh$
 where slug = 'bicep-curl-barbell';

update exercise_template
   set title_zh = $zh$绳索肱二头肌弯举$zh$,
       how_to_zh = $zh$1. 将直杆装到低位绳索滑轮上。
2. 在配重片上设置合适的重量。
3. 前倾，掌心朝上均匀握住直杆。
4. 站起并后退（如有需要），将重量提起离开配重片。
5. 肩部后收，收紧腹部，肘部贴近体侧。
6. 吸气并弯举重量，肘部保持稳定。
7. 将重量举至手腕略高于肘部，然后呼气。
8. 缓慢下放重量，下放过程中吸气。
$zh$
 where slug = 'bicep-curl-cable';

update exercise_template
   set title_zh = $zh$哑铃肱二头肌弯举$zh$,
       how_to_zh = $zh$1. 拿一对哑铃站直，双脚以舒适的宽度站开，肩部后收。
2. 手腕朝前，手臂伸直。
3. 吸气，同时弯举两个哑铃。将重量举至手腕略高于肘部，然后呼气。
4. 缓慢伸直手臂，下放过程中吸气。
$zh$
 where slug = 'bicep-curl-dumbbell';

update exercise_template
   set title_zh = $zh$固定器械肱二头肌弯举$zh$,
       how_to_zh = $zh$1. 在器械上选择合适的重量，并调整座椅高度。
2. 坐下，握住体侧的把手。
3. 肩部后收，收紧腹部，吸气。
4. 弯曲一侧手臂抬起把手。弯举至手略高于肘部，然后呼气。
5. 吸气，缓慢伸直手臂。
6. 以同样方式弯曲另一侧手臂。
7. 持续交替，直到完成该组。
$zh$
 where slug = 'bicep-curl-machine';

update exercise_template
   set title_zh = $zh$悬吊带肱二头肌弯举$zh$,
       how_to_zh = $zh$1. 握住悬吊训练器上的两个把手。
2. 双脚向前走，使身体向后倾斜一定角度。
3. 身体绷直，收紧臀部，肩部后收。
4. 吸气，屈臂将身体拉起。
5. 屈臂至肘部略大于 90 度角，然后呼气。
6. 吸气，缓慢伸直手臂，将身体放回起始位置。
$zh$
 where slug = 'bicep-curl-suspension';

update exercise_template
   set title_zh = $zh$自行车卷腹$zh$,
       how_to_zh = $zh$1. 仰卧在地面上，双腿抬离地面，膝盖弯曲呈 90 度角。
2. 指尖放在头或颈后。
3. 吸气，收紧核心，卷腹使右肘靠近左膝。呼气。
4. 吸气，同时舒展身体。
5. 再次卷腹，使左肘靠近右膝。再次呼气。
6. 持续交替，直到完成该组。
$zh$
 where slug = 'bicycle-crunch';

update exercise_template
   set title_zh = $zh$抬腿自行车卷腹$zh$,
       how_to_zh = $zh$1. 仰卧在地面上，双腿抬离地面并在空中伸直。
2. 指尖放在头或颈后。
3. 吸气，收紧核心，卷起上半身。
4. 扭转上半身，使右肘靠近左腿。同时弯曲左膝，让它靠近对侧肘部。
5. 保持片刻并呼气。
6. 舒展身体并吸气。
7. 使左肘靠近右膝。
8. 持续交替，直到完成该组。
$zh$
 where slug = 'bicycle-crunch-raised-legs';

update exercise_template
   set title_zh = $zh$鸟狗式$zh$,
       how_to_zh = $zh$1. 跪撑于地面。肩、肘、腕成一直线，膝盖位于髋部正下方。双手平放地面。
2. 收紧腹部，吸气。
3. 向后上方伸直右腿，与躯干成一直线。同时向前伸直并抬起左臂。呼气。
4. 吸气，将手臂和腿收回起始位置。
5. 换另一侧手脚伸展。
6. 持续交替对侧手脚，直到完成该组。
$zh$
 where slug = 'bird-dog';

update exercise_template
   set title_zh = $zh$跳箱$zh$,
       how_to_zh = $zh$1. 站在跳箱或平板凳前。
2. 双脚靠拢，脊柱保持中立。
3. 吸气，双臂后摆，同时下蹲至四分之一蹲。
4. 脚跟发力并向前摆臂，立即起跳。
5. 落在凳子或跳箱上时呼气。
6. 走下跳箱并吸气。
$zh$
 where slug = 'box-jump';

update exercise_template
   set title_zh = $zh$杠铃箱式深蹲$zh$,
       how_to_zh = $zh$1. 将杠铃调到合适高度，并在身后放一个跳箱。
2. 像做标准深蹲那样解开杠铃，后退几步。跳箱应距离脚跟数英寸。
3. 吸气，下蹲。
4. 下蹲直到臀部触到跳箱。
5. 保持片刻，脚跟发力蹲起。呼气。
$zh$
 where slug = 'box-squat-barbell';

update exercise_template
   set title_zh = $zh$拳击$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）$zh$
 where slug = 'boxing';

update exercise_template
   set title_zh = $zh$杠铃保加利亚分腿蹲$zh$,
       how_to_zh = $zh$1. 背对平板凳或跳箱。
2. 握住杠铃，举过头顶，置于颈后斜方肌上方。
3. 一条腿向后伸展，把脚搭在凳上。
4. 肩部后收，收紧核心，吸气。
5. 弯曲前腿膝盖下蹲。
6. 下降至前侧大腿几乎与地面平行。
7. 在最低点保持片刻，脚跟发力伸直腿部，同时呼气。
8. 完成目标次数后换腿，另一条腿做相同的次数。
$zh$
 where slug = 'bulgarian-split-squat-barbell';

update exercise_template
   set title_zh = $zh$哑铃保加利亚分腿蹲$zh$,
       how_to_zh = $zh$1. 背对平板凳。
2. 拿一对哑铃，一条腿向后伸展，把脚搭在凳上。
3. 肩部后收，收紧核心，吸气。
4. 弯曲前腿下蹲。
5. 下降至前侧大腿几乎与地面平行。
6. 在最低点保持片刻，脚跟发力伸直腿部，同时呼气。
7. 完成目标次数后换腿，另一条腿做相同的次数。
$zh$
 where slug = 'bulgarian-split-squat-dumbbell';

update exercise_template
   set title_zh = $zh$波比跳$zh$,
       how_to_zh = $zh$1. 站直，双脚以舒适的宽度站开，手臂垂于体侧，目视前方。
2. 吸气，前倾屈膝，双手平放在脚前的地面上。
3. 双腿向后蹬出，使身体伸展成俯卧撑姿势。肩、髋、膝、踝应在一条直线上。
4. 吸气做一个俯卧撑，下降至面部离地一两英寸（可选）。伸直手臂时呼气。
5. 吸气，双腿向前收回，使双脚落在双手后方。
6. 身体伸展，双臂举过头顶，垂直起跳。呼气。
$zh$
 where slug = 'burpee';

update exercise_template
   set title_zh = $zh$波比跳远$zh$,
       how_to_zh = $zh$1. 站直，双脚与肩同宽。
2. 吸气，前倾，双手撑在舒适的俯卧撑位置，双腿向后蹬出使身体伸展。
3. 做一个俯卧撑，胸部触地。
4. 撑起身体，双腿向前收回，落在靠近双手的位置。
5. 起身双脚起跳，同时呼气。
6. 立即再次吸气，下俯准备下一个俯卧撑。
$zh$
 where slug = 'burpee-broad-jumps';

update exercise_template
   set title_zh = $zh$波比跳过杠铃$zh$,
       how_to_zh = $zh$1. 将杠铃放在地面上，侧身站在杠铃旁。
2. 下蹲撑成高平板姿势。
3. 身体绷直，肩、肘、腕成一直线，吸气做一个俯卧撑。呼气时撑回高平板姿势。
4. 双腿向前收回并站起。
5. 再次呼气，同时侧向跳过杠铃。
6. 再次撑成高平板姿势，吸气，做下一个俯卧撑。
7. 站起并再次侧向跳过杠铃，重复该循环。
8. 持续跳过杠铃，直到完成。
$zh$
 where slug = 'burpee-over-the-bar';

update exercise_template
   set title_zh = $zh$蝴蝶机夹胸$zh$,
       how_to_zh = $zh$1. 在蝴蝶机上选择重量。
2. 调整座椅高度，使你能握住把手，且挡垫位于胸前。
3. 坐下，握住把手，肩部后收。
4. 收紧腹部，吸气。
5. 收缩胸肌，将把手从体侧收到躯干前方，同时呼气。
6. 吸气，将手臂收回体侧。
$zh$
 where slug = 'butterfly-pec-deck';

update exercise_template
   set title_zh = $zh$绳索帕洛夫推$zh$,
       how_to_zh = $zh$1. 在绳索器械上选择重量。
2. 将滑轮调至胸部高度并装上把手。
3. 双手握住把手，侧身站立。
4. 肩部后收，收紧臀部，绷紧核心。
5. 吸气，将把手向前推，手臂完全伸直并呼气。
6. 停顿片刻，吸气，将把手收回身体。
$zh$
 where slug = 'cable-core-pallof-press';

update exercise_template
   set title_zh = $zh$绳索卷腹$zh$,
       how_to_zh = $zh$1. 双手握住绳索把手，拇指朝上。
2. 跪下，前倾，将绳索置于头后。双手靠近颈部。
3. 到位后绷紧核心。
4. 吸气并收缩腹部，开始卷腹。专注于卷起躯干，而不是只在髋部移动。
5. 保持片刻并呼气。
6. 吸气，缓慢抬起躯干回到起始位置。
$zh$
 where slug = 'cable-crunch';

update exercise_template
   set title_zh = $zh$绳索交叉飞鸟$zh$,
       how_to_zh = $zh$1. 调整绳索交叉器械两侧配重片的重量。
2. 将两个滑轮调至最高位置并装上把手。
3. 依次握住两个把手，站到两根立柱中间。
4. 手臂置于体侧，向前迈半步，将重量提起离开配重片。
5. 收紧腹部，肩部后收，吸气。
6. 手臂向内向下合拢，在髋部前方双手相触。呼气。
7. 保持片刻，吸气，将手臂收回体侧。
$zh$
 where slug = 'cable-fly-crossovers';

update exercise_template
   set title_zh = $zh$绳索穿裆拉$zh$,
       how_to_zh = $zh$1. 在单柱或双柱绳索器械上选择合适的重量。
2. 将滑轮调至最低位置，装上把手或绳索。
3. 背对绳索器械，前倾，握住连接件并夹在双腿之间。
4. 向前走一两步，将重量提起离开配重片。
5. 收紧腹部，吸气。
6. 以髋部为轴，上身前倾，背部保持中立。
7. 前倾至躯干大致与地面平行，然后髋部前顶使身体站直。站直时呼气。
$zh$
 where slug = 'cable-pull-through';

update exercise_template
   set title_zh = $zh$绳索转体（由下向上）$zh$,
       how_to_zh = $zh$1. 在绳索器械上选择合适的重量。
2. 将滑轮调至最低位置并装上把手。
3. 双手握住把手，手腕保持中立（相对）。
4. 远离绳索器械迈一步，侧身站立，双脚分开以形成稳定的支撑。
5. 把手位于腰部、手臂伸直，收紧腹部，吸气。
6. 将绳索沿对角线向上拉过身体，扭转躯干并呼气。
7. 保持一秒，吸气，将躯干转回起始位置。
8. 一侧练完后，身体转 180 度，另一侧做相同的次数。
$zh$
 where slug = 'cable-twist-down-to-up';

update exercise_template
   set title_zh = $zh$绳索转体（由上向下）$zh$,
       how_to_zh = $zh$1. 在绳索器械上选择合适的重量。
2. 将滑轮调至最高位置并装上把手。
3. 双手握住把手，手腕保持中立（相对）。
4. 远离绳索器械迈一步，侧身站立。
5. 把手位于肩部高度、手臂伸直，收紧腹部，吸气。
6. 将绳索沿对角线拉过身体，扭转躯干并呼气。
7. 吸气，将身体转回起始位置。
8. 完成后，身体转 180 度，另一侧做相同的次数。
$zh$
 where slug = 'cable-twist-up-to-down';

update exercise_template
   set title_zh = $zh$固定器械小腿伸展$zh$,
       how_to_zh = $zh$1. 在小腿伸展器械上选择合适的重量。
2. 坐下，握住体侧的把手。
3. 前脚掌踩在踏板上。双腿保持伸直。
4. 吸气，绷脚踝将踏板推开，同时呼气。
5. 保持片刻，吸气，让脚踝弯曲。
$zh$
 where slug = 'calf-extension-machine';

update exercise_template
   set title_zh = $zh$固定器械小腿推举$zh$,
       how_to_zh = $zh$1. 为腿举器械加上重量并坐下。
2. 抬起双腿，前脚掌踩在踏板边缘。
3. 肩部后收，握住体侧的把手。
4. 伸直膝盖，解开重量。
5. 绷脚踝将踏板推离身体，保持片刻并呼气。
6. 吸气，让脚踝弯曲并拉伸小腿。
7. 完成后，转动所握的把手将重量锁定。
$zh$
 where slug = 'calf-press-machine';

update exercise_template
   set title_zh = $zh$双杠臂屈伸$zh$,
       how_to_zh = $zh$1. 双手略宽于肩握住双杠。
2. 肩部后收，收紧腹部。
3. 撑起身体，手臂完全伸直支撑在双杠上方。
4. 身体前倾。
5. 吸气，屈肘下降。下降过程中保持身体姿势。
6. 下降至胸肌有明显拉伸感（通常到肘部呈 90 度角）。
7. 撑回顶端，在顶端呼气。
$zh$
 where slug = 'chest-dip';

update exercise_template
   set title_zh = $zh$辅助双杠臂屈伸$zh$,
       how_to_zh = $zh$1. 在双杠臂屈伸器械上选择合适的重量。
2. 握住两个把手，膝盖跪在挡垫上。
3. 伸直手臂，肩部后收，收紧腹部。
4. 吸气，屈肘下降。
5. 下降至肘部约 90 度，然后撑回顶端并呼气。
$zh$
 where slug = 'chest-dip-assisted';

-- 0017 fragment 03 — chest-dip-weighted .. decline-chest-fly-dumbbell
update exercise_template
   set title_zh = $zh$负重双杠臂屈伸$zh$,
       how_to_zh = $zh$1. 用专用腰带将杠铃片固定在身上。
2. 踏上踏板，双手握住双杠，手臂伸直并贴近身体。
3. 肩部后收下沉，收紧腹部，夹紧臀部。
4. 双脚离开踏板，使身体悬空。
5. 身体略微前倾。
6. 吸气，屈肘下放身体。保持肩胛骨后收，身体稳定。
7. 下放至肘部呈 90 度，稍作停顿。
8. 用力撑起回到顶端，手臂完全伸展并呼气。
9. 再次吸气，重复动作。
$zh$
 where slug = 'chest-dip-weighted';

update exercise_template
   set title_zh = $zh$弹力带飞鸟$zh$,
       how_to_zh = $zh$1. 取一条两端带握把的阻力带。
2. 将阻力带固定在牢固的物体上（如深蹲架）。
3. 背对固定点，双手握住两个握把，贴近身体。
4. 向前走几步拉长阻力带，双臂置于身体两侧，肘部不要外展。
5. 肩部后收，收紧腹部，吸气。
6. 双臂向前移动，在胸前轻碰指关节，肘部保持微屈。呼气。
7. 吸气，双臂回到身体两侧。
$zh$
 where slug = 'chest-fly-band';

update exercise_template
   set title_zh = $zh$哑铃飞鸟$zh$,
       how_to_zh = $zh$1. 取一对轻哑铃，坐在平板凳边缘。
2. 将哑铃放在大腿上，仰卧躺下，保持哑铃贴近身体。
3. 手臂伸直，将哑铃举于胸部上方，掌心相对。
4. 双脚踩实地面，肩部后收。
5. 吸气。
6. 双臂向两侧下放，直至与躯干平行。
7. 呼气，双臂内收，在胸部上方让哑铃相碰。
$zh$
 where slug = 'chest-fly-dumbbell';

update exercise_template
   set title_zh = $zh$固定器械飞鸟$zh$,
       how_to_zh = $zh$1. 选择合适的配重并调整座椅高度。坐下时器械握把应与胸部同高。
2. 坐下，肩部后收，向两侧伸手握住握把。
3. 收紧腹部，吸气。
4. 夹紧胸肌，双臂内收，呼气时在胸前轻碰指关节。
5. 双臂回到身体两侧，感受胸肌拉伸。吸气。
$zh$
 where slug = 'chest-fly-machine';

update exercise_template
   set title_zh = $zh$悬吊带飞鸟$zh$,
       how_to_zh = $zh$1. 背对悬吊带的固定点，双手握住两个握把。
2. 手臂伸直，向前抬起，收紧腹部。
3. 双脚向后走，使身体前倾。用双臂支撑身体。
4. 吸气，双臂缓慢向两侧打开，身体下放，拉伸胸肌。
5. 在力所能及的范围内将双臂向两侧展开，稍作停顿，然后内收并撑起身体。
6. 在顶端位置让指关节相碰，呼气。
$zh$
 where slug = 'chest-fly-suspension';

update exercise_template
   set title_zh = $zh$弹力带推胸$zh$,
       how_to_zh = $zh$1. 取一条带握把的阻力带。
2. 将阻力带固定在胸部高度牢固的物体上，深蹲架即可。
3. 背对固定点，双手握住两个握把，双臂抬高，肘部收紧。
4. 向前走几步拉长阻力带，形成一定张力。
5. 肩部后收，前后开立站稳，收紧核心，吸气。
6. 呼气，将阻力带向前推出，手臂完全伸展。
7. 吸气，屈臂，让指关节回到胸部两侧。
$zh$
 where slug = 'chest-press-band';

update exercise_template
   set title_zh = $zh$固定器械推胸$zh$,
       how_to_zh = $zh$1. 在器械上选择合适的配重。
2. 调整座椅高度。坐下时握把应略低于下胸。
3. 坐下，握住握把，肩部后收，收紧腹部。双脚平放地面。
4. 吸气，向前推至手臂完全伸展。呼气。
5. 吸气，缓慢屈臂还原。
$zh$
 where slug = 'chest-press-machine';

update exercise_template
   set title_zh = $zh$哑铃胸部支撑上斜划船$zh$,
       how_to_zh = $zh$1. 将可调凳调至 30 至 45 度的上斜角度。
2. 取一对哑铃，俯卧在凳上，腹部和胸部贴住靠背垫。
3. 双臂伸直，自然下垂。
4. 肩部后收，夹紧臀部，收紧腹部。
5. 手腕向外旋转，使指关节朝前。
6. 吸气，以流畅的动作将哑铃尽可能高地划起。顶端呼气。
7. 缓慢下放哑铃，下放过程中吸气。
$zh$
 where slug = 'chest-supported-incline-row-dumbbell';

update exercise_template
   set title_zh = $zh$哑铃胸部支撑反向飞鸟$zh$,
       how_to_zh = $zh$1. 取一对轻哑铃，俯卧在上斜凳上。
2. 保持身体挺直，用前脚掌支撑。
3. 双臂伸直下垂，掌心相对。
4. 肩部后收，吸气。
5. 将哑铃向两侧和后方抬起，感到肩后束发力时停止。呼气。
6. 稍作停顿，吸气，双臂缓慢下放。
$zh$
 where slug = 'chest-supported-reverse-fly-dumbbell';

update exercise_template
   set title_zh = $zh$胸部支撑 T 杠划船$zh$,
       how_to_zh = $zh$1. 在杠铃上加负重。
2. 上器械，将胸部和腹部贴住靠垫，双脚踩在踏板上。
3. 向前伸手，用正握（掌心向下）握住两个握把。
4. 解开杠铃，将其移至中间位置。
5. 吸气，以流畅的动作拉动杠铃，夹紧上背并呼气。
6. 吸气，缓慢伸直手臂还原。
7. 重复动作。
$zh$
 where slug = 'chest-supported-t-bar-row';

update exercise_template
   set title_zh = $zh$哑铃胸部支撑 Y 字举$zh$,
       how_to_zh = $zh$1. 将训练凳调至 45 度上斜。
2. 取一对轻哑铃，坐下，胸部和腹部贴住靠背垫，双臂自然垂于体侧。
3. 深吸气，以流畅的动作将哑铃向前上方举起，顶端呼气。
4. 吸气，将哑铃下放回起始位置。
$zh$
 where slug = 'chest-supported-y-raise-dumbbell';

update exercise_template
   set title_zh = $zh$反手引体向上$zh$,
       how_to_zh = $zh$1. 向上伸手，以反握（掌心朝向自己）握住引体向上杆。双手与肩同宽或略窄。
2. 肩部后收，收紧腹部，夹紧臀部，小腿交叉，双脚离地。
3. 吸气，以流畅的动作将身体拉起。顶端尽量让下巴超过横杆。呼气。
4. 吸气，缓慢下放身体。双脚不要触地休息。
$zh$
 where slug = 'chin-up';

update exercise_template
   set title_zh = $zh$辅助反手引体向上$zh$,
       how_to_zh = $zh$1. 在器械上选择合适的配重。
2. 向上伸手，以反握（掌心朝向自己）握住横杆。双手与肩同宽。
3. 双膝跪在器械的托垫上。
4. 肩部后收，夹紧臀部，收紧腹部。
5. 吸气，以流畅的动作将身体拉起，顶端呼气。
6. 吸气，缓慢下放身体，手臂完全伸直。
$zh$
 where slug = 'chin-up-assisted';

update exercise_template
   set title_zh = $zh$负重反手引体向上$zh$,
       how_to_zh = $zh$1. 用专用负重腰带将杠铃片固定在身上。
2. 向上伸手，以反握（掌心朝向自己）握住引体向上杆。
3. 肩部后收，收紧腹部，夹紧臀部，小腿交叉，双脚离地。
4. 吸气，以流畅的动作将身体拉起，同时呼气。
5. 缓慢下放身体，手臂完全伸直，吸气。双脚不要触地休息。
$zh$
 where slug = 'chin-up-weighted';

update exercise_template
   set title_zh = $zh$蚌式开合$zh$,
       how_to_zh = $zh$1. 侧卧，双腿叠放，屈膝，下方手臂肩部呈 90 度，前臂贴地保持平衡。可在大腿上方套一条迷你环形阻力带以增加阻力。
2. 保持脊柱中立，吸气。
3. 双脚保持并拢，抬起上方膝盖。动作如蚌壳张开。
4. 以流畅的动作尽可能抬高膝盖，呼气。
5. 吸气，将膝盖下放还原。
6. 完成后换另一侧，做相同次数。
$zh$
 where slug = 'clamshell';

update exercise_template
   set title_zh = $zh$击掌俯卧撑$zh$,
       how_to_zh = $zh$1. 跪撑后伸直身体成俯卧撑姿势。身体保持挺直，肩、肘、腕成一直线。
2. 肩部后收，夹紧臀部。
3. 吸气，屈肘下放身体。
4. 下放至面部距离地面一两英寸，稍作停顿。
5. 尽可能爆发性地撑起，双手离地。呼气。
6. 双手立即并拢击掌，然后撑回地面。
7. 吸气，下放身体。
$zh$
 where slug = 'clap-push-ups';

update exercise_template
   set title_zh = $zh$下蹲翻$zh$,
       how_to_zh = $zh$1. 站在装有杠铃片的杠铃前，小腿距杠铃约两英寸。双脚与髋同宽，脚尖略微外展。
2. 俯身，用等宽正握握住杠铃。让膝盖抵住肘窝。
3. 挺胸，使背部保持中立位。髋部应略高于膝盖。
4. 脚跟蹬地，将杠铃拉离地面，开始第一次发力。初次上拉要爆发有力，为后续动作积蓄惯性。
5. 当杠铃超过膝盖后，持续向前顶髋，同时沿垂直直线拉起杠铃。整个动作应连贯流畅。
6. 杠铃上升时下蹲接杠，使其落于肩部和上胸位置。握紧杠铃，肘部朝前。
7. 杠铃落到前架位后，再下蹲几英寸，直至大腿与地面平行，然后起身站直，膝关节完全伸直并呼气。
8. 缓慢下放杠铃，以髋部铰链动作保持脊柱中立。杠铃下放过程中或开始下一次动作前吸气。
$zh$
 where slug = 'clean';

update exercise_template
   set title_zh = $zh$挺举$zh$,
       how_to_zh = $zh$1. 站在装有杠铃片的杠铃前，小腿距杠铃约两英寸。双脚与髋同宽，脚尖略微外展。
2. 俯身，用等宽正握握住杠铃。让膝盖抵住肘窝。
3. 挺胸，使背部保持中立位。髋部应略高于膝盖。
4. 脚跟蹬地，将杠铃拉离地面，开始第一次发力。初次上拉要爆发有力，为后续动作积蓄惯性。
5. 当杠铃超过膝盖后，持续向前顶髋，同时沿垂直直线拉起杠铃。整个动作应连贯流畅。
6. 杠铃上升时下蹲接杠，使其落于肩部和上胸位置。握紧杠铃，肘部朝前。
7. 杠铃落到前架位后，再下蹲几英寸，直至大腿与地面平行，然后起身站直，膝关节完全伸直并呼气。
8. 再次吸气，微微屈膝预蹲，用力上挺杠铃至头顶，同时伸直肘部和膝盖。
9. 将杠铃下放至肩部，呼气。
10. 保持背部中立，将杠铃放回地面。下放过程中或开始下一次动作前吸气。
$zh$
 where slug = 'clean-and-jerk';

update exercise_template
   set title_zh = $zh$下蹲翻推举$zh$,
       how_to_zh = $zh$1. 站在装有杠铃片的杠铃前，小腿距杠铃约两英寸。双脚与髋同宽，脚尖略微外展。
2. 俯身，用等宽正握握住杠铃。让膝盖抵住肘窝。
3. 挺胸，使背部保持中立位。髋部应略高于膝盖。
4. 脚跟蹬地，将杠铃拉离地面，开始第一次发力。初次上拉要爆发有力，为后续动作积蓄惯性。
5. 当杠铃超过膝盖后，持续向前顶髋，同时沿垂直直线拉起杠铃。整个动作应连贯流畅。
6. 杠铃上升时下蹲接杠，使其落于肩部和上胸位置。握紧杠铃，肘部朝前。
7. 杠铃落到前架位后，再下蹲几英寸，直至大腿与地面平行，然后起身站直，膝关节完全伸直并呼气。
8. 再次吸气，将杠铃垂直向上推起，头部后移以免碰到鼻子或下巴。再次呼气。
9. 将杠铃下放至肩部，然后放回起始位置。
$zh$
 where slug = 'clean-and-press';

update exercise_template
   set title_zh = $zh$翻拉$zh$,
       how_to_zh = $zh$1. 站在杠铃前。双脚与髋同宽，杠铃位于脚掌中部上方。
2. 俯身，用等宽正握握住杠铃。
3. 肩部后收以挺直背部，身体下沉贴合杠铃，拉紧杠铃的空隙。
4. 吸气，脚跟蹬地开始上拉。
5. 伸展髋部和膝盖，同时保持背部中立。
6. 杠铃上升时，伸展膝盖和髋部。
7. 杠铃超过膝盖后，用力将脚跟压向地面，如同做垂直起跳，进入第二阶段。
8. 杠铃继续上升时，向前顶髋，完全伸展膝盖和髋部。
9. 立即耸肩并向上提拉，直至杠铃略高于腰部。用力呼气。
10. 先向后送臀，缓慢下放杠铃。保持挺胸、背部挺直。下放过程中或开始下一次动作前吸气。
$zh$
 where slug = 'clean-pull';

update exercise_template
   set title_zh = $zh$攀岩$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）$zh$
 where slug = 'climbing';

update exercise_template
   set title_zh = $zh$集中弯举$zh$,
       how_to_zh = $zh$1. 取一只轻哑铃，坐在平板凳上。
2. 双腿分开，将哑铃放在两腿之间。
3. 俯身用右手握住哑铃。
4. 将哑铃提离地面，右臂肱三头肌（上臂）贴住大腿内侧。
5. 挺胸，身体保持稳定，吸气，手臂伸直。
6. 弯举哑铃直至手腕高于肘部。上臂始终贴住大腿内侧。顶端夹紧肌肉并呼气。
7. 吸气，缓慢下放哑铃，肘部完全伸直。
8. 完成后换另一只手臂，做相同次数。
$zh$
 where slug = 'concentration-curl';

update exercise_template
   set title_zh = $zh$交叉锤式弯举$zh$,
       how_to_zh = $zh$1. 取一对哑铃，站直。
2. 双脚自然站立，双臂垂于体侧，掌心朝向身体。
3. 肩部后收，夹紧臀部，吸气。
4. 呼气，将一侧哑铃向身体另一侧弯举至胸前。
5. 吸气，伸直手臂还原。
6. 换另一侧哑铃弯举，交替进行直至完成本组。
$zh$
 where slug = 'cross-body-hammer-curl';

update exercise_template
   set title_zh = $zh$固定器械卷腹$zh$,
       how_to_zh = $zh$1. 选择合适的配重。
2. 坐到器械上。脚踝固定在下方的垫子上，中间靠垫贴住下背，胸部靠在顶部靠垫上。
3. 握住握把以支撑身体。
4. 吸气，收紧腹肌将顶部靠垫向前推。呼气。
5. 吸气，还原。
$zh$
 where slug = 'crunch-machine';

update exercise_template
   set title_zh = $zh$负重卷腹$zh$,
       how_to_zh = $zh$1. 取一片杠铃片，仰卧于地面。
2. 将杠铃片置于胸部上方。
3. 双腿并拢，屈膝，双脚踩实地面。
4. 吸气，收紧腹肌卷起躯干，使肩胛骨离地数英寸。呼气。
5. 吸气，将躯干下放回地面。
$zh$
 where slug = 'crunch-weighted';

update exercise_template
   set title_zh = $zh$哑铃交叉弓步$zh$,
       how_to_zh = $zh$1. 双手各持一只哑铃，站直。
2. 收紧腹部，肩部后收，吸气。
3. 右腿向后划半圆，交叉跨过左腿。
4. 前脚掌落地，下蹲成弓步。
5. 下蹲至后侧膝盖几乎触地。
6. 呼气，前脚脚跟发力蹬起，伸直腿部，右腿回到起始位置。
7. 再次吸气，换另一侧腿做相同动作。
8. 左右腿交替进行直至完成。
$zh$
 where slug = 'curtsy-lunge-dumbbell';

update exercise_template
   set title_zh = $zh$骑行$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）$zh$
 where slug = 'cycling';

update exercise_template
   set title_zh = $zh$死虫式$zh$,
       how_to_zh = $zh$1. 在地上铺好训练垫，仰卧。
2. 双脚离地，屈膝呈 90 度。
3. 双臂抬起置于胸部上方。
4. 收紧腹肌以保持脊柱弧度，吸气。
5. 伸直左腿，使脚距离地面一两英寸。
6. 同时右臂向后伸展，使手贴近地面（可选）。呼气。
7. 吸气，将手臂和腿收回起始位置。
8. 伸展对侧手臂和腿。
$zh$
 where slug = 'dead-bug';

update exercise_template
   set title_zh = $zh$静力悬垂$zh$,
       how_to_zh = $zh$1. 站在引体向上杆下方。
2. 向上伸手，用等宽正握握住横杆。
3. 双脚离地，双腿并拢。
4. 放松肩部和核心，依靠握力支撑身体。
5. 尽可能长时间悬垂，期间保持均匀呼吸。
$zh$
 where slug = 'dead-hang';

update exercise_template
   set title_zh = $zh$弹力带硬拉$zh$,
       how_to_zh = $zh$1. 取一条两侧带握把的阻力带。
2. 跨站在阻力带上，双脚相距几英寸。
3. 身体挺直，肩部后收，收紧腹部。
4. 吸气，以髋部为轴向前俯身。
5. 下放过程中屈膝，保持脊柱中立。
6. 尽可能下放——理想情况下至双手离地数英寸。
7. 稍作停顿，向前顶髋伸展身体。
8. 接近顶端时呼气。
$zh$
 where slug = 'deadlift-band';

update exercise_template
   set title_zh = $zh$杠铃硬拉$zh$,
       how_to_zh = $zh$1. 站在装有杠铃片的杠铃前。
2. 杠铃应位于脚掌中部上方，小腿距杠铃约一两英寸，双脚与髋同宽，脚尖略微外展。
3. 俯身，用双正握握住杠铃。
4. 屈膝使小腿贴住杠铃。同时后收肩部以挺直背部。
5. 吸气。
6. 脚跟蹬地开始上拉。
7. 沿垂直直线拉起杠铃，使其贴近身体。
8. 杠铃过膝后，开始伸腿并向前顶髋，完成动作。
9. 向后送臀开始下放，保持背部中立。
10. 沿同一条垂直直线下放杠铃，接近底部时呼气。
$zh$
 where slug = 'deadlift-barbell';

update exercise_template
   set title_zh = $zh$哑铃硬拉$zh$,
       how_to_zh = $zh$1. 双脚与髋同宽，将一对哑铃平行置于脚边。从上方看，每只哑铃的前侧配重片应与脚掌中部对齐。
2. 俯身，保持手臂伸直握住哑铃。
3. 不要提起哑铃，挺胸使背部处于中立位。
4. 吸气，脚跟发力，上半身和腿部协同用力开始上拉。
5. 沿垂直直线拉起哑铃，使其来到身体两侧。
6. 同时伸展髋部和膝盖，尤其在哑铃过膝时，继续起身至站立。顶端呼气。
7. 以髋部铰链、向后送臀开始下放——沿同一条垂直直线放下哑铃。
8. 哑铃下放过程中或开始下一次动作前吸气。
$zh$
 where slug = 'deadlift-dumbbell';

update exercise_template
   set title_zh = $zh$硬拉高拉$zh$,
       how_to_zh = $zh$1. 站在装有杠铃片的杠铃前。
2. 双脚宽站，脚尖外展。小腿距杠铃约一两英寸。
3. 俯身，用双正握握住杠铃。双手相距数英寸。
4. 屈膝挺胸，身体贴住杠铃，挺直背部。
5. 脚跟蹬地，腿部发力开始上拉。
6. 伸展髋部和膝盖直至站直。
7. 身体伸展的同时，立即沿垂直直线拉动杠铃。
8. 将杠铃提至胸部高度并呼气。
9. 杠铃到达大腿上部时，以髋部为轴下放杠铃。
10. 沿同一条垂直直线下放杠铃。
11. 下放过程中或开始下一次动作前吸气。
$zh$
 where slug = 'deadlift-high-pull';

update exercise_template
   set title_zh = $zh$史密斯机硬拉$zh$,
       how_to_zh = $zh$1. 将史密斯机横杆调至最低位置并加负重。
2. 面向横杆站立，小腿距横杆约两英寸。
3. 俯身，用双正握握住横杆。
4. 微屈膝，挺胸使背部保持中立位。
5. 吸气，向上拉起横杆，接近顶端时伸展髋部并呼气。
6. 在顶端稍作停顿，向后送臀下放横杆。
7. 横杆降至大腿下部时屈膝。保持脊柱中立。
8. 下放过程中或开始下一次动作前吸气。
$zh$
 where slug = 'deadlift-smith-machine';

update exercise_template
   set title_zh = $zh$六角杠硬拉$zh$,
       how_to_zh = $zh$1. 在六角杠上加负重并站入其中。双脚与髋同宽，脚尖略微外展。
2. 下蹲，握住两侧的握把。
3. 肩部后收以挺直背部。
4. 吸气，脚跟蹬地开始上拉。
5. 杠铃上升时，逐渐伸展髋部和膝盖直至站直。呼气。
6. 缓慢下放六角杠。先向后送臀，再逐渐屈膝，回到起始位置。
7. 杠铃下放时或开始下一次动作前吸气。
$zh$
 where slug = 'deadlift-trap-bar';

update exercise_template
   set title_zh = $zh$下斜杠铃卧推$zh$,
       how_to_zh = $zh$1. 仰卧在下斜凳上，使额头正对横杆下方。
2. 用双正握握住杠铃。双手间距应大于肩宽。
3. 肩部后收，收紧腹部，吸气。
4. 小心解开杠铃，将其移至胸部上方。
5. 再次吸气，将杠铃下放至下胸。
6. 轻触躯干后，将杠铃垂直推起，接近顶端时呼气。
7. 完成后，将杠铃移至头部上方放回架上，再放松身体。
$zh$
 where slug = 'decline-bench-press-barbell';

update exercise_template
   set title_zh = $zh$下斜哑铃卧推$zh$,
       how_to_zh = $zh$1. 在下斜凳上躺好，固定双脚。
2. 仰卧，后收肩胛骨。
3. 请同伴逐一递给你哑铃。也可以自己持铃小心躺下。
4. 手臂保持伸直，收紧核心，哑铃置于胸部上方。
5. 吸气。
6. 将哑铃向两侧下放，肘部适当内收。
7. 下放至肘部与躯干齐平。
8. 将哑铃垂直推起，推起过程中呼气。
9. 完成后，请他人从手中接过至少一只哑铃，再坐起。
$zh$
 where slug = 'decline-bench-press-dumbbell';

update exercise_template
   set title_zh = $zh$固定器械下斜卧推$zh$,
       how_to_zh = $zh$1. 在器械上加载合适的配重。
2. 调整座椅高度，使坐下时握把略低于胸部。
3. 坐下并握住握把。肘部贴近身体两侧。
4. 后收肩胛骨，双脚踩实地面，收紧腹部，吸气。
5. 将握把向前下方推，完全伸直肘部并呼气。稍作停顿，夹紧胸肌。
6. 吸气，缓慢屈臂还原。
$zh$
 where slug = 'decline-bench-press-machine';

update exercise_template
   set title_zh = $zh$史密斯机下斜卧推$zh$,
       how_to_zh = $zh$1. 将下斜凳置于史密斯机下方。调整凳子位置，使仰卧时横杆位于下胸上方。
2. 为横杆加载合适的重量，并将其调至仰卧时可触及的高度。
3. 仰卧，用双正握握住横杆，后收肩部。
4. 伸直手臂将横杆解开。
5. 吸气，将横杆下放至胸部。
6. 将横杆推至顶端位置并呼气。
7. 完成后，小心将横杆放回架上，然后站起。
$zh$
 where slug = 'decline-bench-press-smith-machine';

update exercise_template
   set title_zh = $zh$下斜哑铃飞鸟$zh$,
       how_to_zh = $zh$1. 将训练凳调至下斜角度。
2. 取一对轻哑铃，坐在凳上，固定双脚。
3. 保持哑铃贴近胸部，小心仰卧躺下。
4. 手臂伸直，将哑铃举于胸部上方，后收肩胛骨。手腕保持中立（双手相对）。
5. 吸气，双臂向两侧下放，拉伸胸肌。全程保持肘部微屈。
6. 呼气，双臂内收，夹紧胸肌，在顶端让哑铃相碰。
$zh$
 where slug = 'decline-chest-fly-dumbbell';

-- 0017 fragment 04 — decline-crunch .. good-morning-barbell
update exercise_template
   set title_zh = $zh$下斜卷腹$zh$,
       how_to_zh = $zh$1. 坐上下斜凳，固定双脚。
2. 小心后仰躺下，让脊柱贴合靠背。
3. 双手置于头后。
4. 吸气，收紧腹直肌卷起躯干。将肩胛骨抬离凳面数英寸并呼气。
5. 吸气，放下躯干。
$zh$
 where slug = 'decline-crunch';
update exercise_template
   set title_zh = $zh$负重下斜卷腹$zh$,
       how_to_zh = $zh$1. 拿起杠铃片，坐上下斜凳，固定双腿。
2. 小心后仰躺下，将杠铃片贴在胸前。
3. 吸气，收紧腹部卷起躯干。
4. 将肩胛骨抬离地面数英寸并呼气。
5. 稍作停顿，吸气时缓慢放下躯干。
$zh$
 where slug = 'decline-crunch-weighted';
update exercise_template
   set title_zh = $zh$下斜俯卧撑$zh$,
       how_to_zh = $zh$1. 四肢着地，将双脚放在健身凳、跳箱或其他稳固物体上。
2. 身体伸展成俯卧撑姿势，双手间距略宽于肩并略微外旋。
3. 手臂伸直，肩胛骨后收。
4. 收紧腹部并吸气。
5. 弯曲手肘放低身体。
6. 下放至面部接近地面。
7. 伸直手臂撑起身体。接近顶部时呼气。
$zh$
 where slug = 'decline-push-up';
update exercise_template
   set title_zh = $zh$垫高硬拉$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）
$zh$
 where slug = 'deficit-deadlift';
update exercise_template
   set title_zh = $zh$钻石俯卧撑$zh$,
       how_to_zh = $zh$1. 四肢着地，双手并拢。拇指与食指相触或仅相距数英寸。
2. 身体伸展成俯卧撑姿势，让肩、髋、膝成一直线。
3. 肩部后收，收紧臀部并吸气。
4. 弯曲手肘放低身体。
5. 尽可能下放，并在最低点稍作停顿。
6. 撑回顶部，伸直手臂时呼气。
$zh$
 where slug = 'diamond-push-up';
update exercise_template
   set title_zh = $zh$下犬式$zh$,
       how_to_zh = $zh$1. 四肢着地，膝盖位于髋部正下方。肩、肘、腕保持垂直对齐。
2. 吸气，伸直手臂的同时将臀部向后推。
3. 抬高臀部并伸直双腿，同时保持上身稳定，过渡到高位姿势。
4. 保持该姿势，然后先弯曲膝盖，再将躯干向前放回。
$zh$
 where slug = 'downward-dog';
update exercise_template
   set title_zh = $zh$拖拽弯举$zh$,
       how_to_zh = $zh$1. 手掌朝前握住装有杠铃片的直杆，站直。
2. 双手应刚好位于大腿外侧。
3. 肩部后收并吸气。
4. 弯曲手肘弯举杠铃，让重量贴着身体上拖。
5. 将杠铃举到尽可能高，在顶部收紧肱二头肌并呼气。
6. 吸气时沿同样的直线放下杠铃。
$zh$
 where slug = 'drag-curl';
update exercise_template
   set title_zh = $zh$龙旗$zh$,
       how_to_zh = $zh$1. 仰卧在平板健身凳上，双手抓住靠背。
2. 伸直身体并收紧腹部。
3. 吸气，用核心肌群将身体抬离凳面。
4. 将身体抬到尽可能高，呼气时稍作停顿。
5. 缓慢放下身体并吸气。
$zh$
 where slug = 'dragon-flag';
update exercise_template
   set title_zh = $zh$蜻蜓式$zh$,
       how_to_zh = $zh$1. 仰卧在平板健身凳上，双手抓住靠背。
2. 伸直身体并收紧腹部。
3. 吸气，收紧核心肌群将身体抬离凳面。
4. 将身体抬到尽可能高，稍作停顿后呼气。
5. 缓慢放下身体并吸气。
$zh$
 where slug = 'dragonfly';
update exercise_template
   set title_zh = $zh$哑铃划船$zh$,
       how_to_zh = $zh$1. 拿起一只哑铃。
2. 将右膝和右手撑在平板健身凳上。左腿和左臂伸直，哑铃握在手中。
3. 肩部后收并收紧腹部。
4. 划船拉起哑铃，直到手肘与躯干齐平，呼气时稍作挤压停顿。
5. 保持肩部位置不变放下重量。下放时吸气。
6. 完成后，换另一只手握哑铃，将左手和左膝撑在凳上，重复动作。
$zh$
 where slug = 'dumbbell-row';
update exercise_template
   set title_zh = $zh$哑铃抓举$zh$,
       how_to_zh = $zh$1. 将一只哑铃放在地面上。
2. 俯身用一只手抓住哑铃。
3. 肩部后收，收紧腹部并吸气。
4. 用一次有力的摆动将哑铃向上提起。
5. 同时微微下蹲（弯曲膝盖）以在头顶接住重量。
6. 呼气时伸直手臂并站直双腿。
7. 缓慢放下哑铃，下放时吸气。
8. 重复。
9. 换另一只手抓握哑铃，重复相同的次数。
$zh$
 where slug = 'dumbbell-snatch';
update exercise_template
   set title_zh = $zh$哑铃挤压卧推$zh$,
       how_to_zh = $zh$1. 拿起一对哑铃，坐在平板健身凳上，将哑铃放在大腿上。
2. 保持手肘弯曲、哑铃贴住身体，缓慢后仰躺下。
3. 伸直手臂，将哑铃置于胸部上方，手腕保持中立（掌心相对），并将两只哑铃相互挤压。
4. 肩部后收并吸气。
5. 将哑铃下放至胸部，稍作停顿，呼气时再推回顶部。
$zh$
 where slug = 'dumbbell-squeeze-press';
update exercise_template
   set title_zh = $zh$哑铃登阶$zh$,
       how_to_zh = $zh$1. 拿起一对哑铃，站在平板健身凳或跳箱前。
2. 肩部后收并吸气。
3. 一条腿向前抬起，将脚掌踩在抬高的物体上。
4. 前脚发力蹬起站上，呼气时让身体站到凳面或箱面上。
5. 退回起始位置并吸气。
6. 换另一条腿向前抬起。
7. 左右腿交替进行。
$zh$
 where slug = 'dumbbell-step-up';
update exercise_template
   set title_zh = $zh$肘触膝$zh$,
       how_to_zh = $zh$1. 仰卧在地面上，弯曲膝盖，旋转右腿，将右脚踝外侧贴在左大腿上。
2. 左手置于头后。
3. 吸气并收紧腹部。
4. 卷起并旋转躯干，让左肘触碰右膝。呼气。
5. 放下躯干并吸气。
6. 完成后，将左脚踝贴在右大腿上，右手置于头后。重复相同的次数。
$zh$
 where slug = 'elbow-to-knee';
update exercise_template
   set title_zh = $zh$椭圆机$zh$,
       how_to_zh = $zh$1. 选择合适的阻力，站上椭圆机。
2. 肩部后收，收紧腹部并吸气。
3. 右腿向前蹬的同时向后拉动右侧把手，开始动作。
4. 保持稳定的节奏，手臂与双腿交替运动。
$zh$
 where slug = 'elliptical-trainer';
update exercise_template
   set title_zh = $zh$EZ 杠肱二头肌弯举$zh$,
       how_to_zh = $zh$1. 给 EZ 杠（弯曲杆）加上重量，双手反握均匀握住（掌心朝前）。
2. 站直，双脚舒适分开，膝盖微屈，肩部后收。
3. 吸气，收紧肱二头肌举起杠铃。
4. 将重量上举至手腕略高于手肘，呼气。
5. 稍作停顿，吸气时伸直手臂。
$zh$
 where slug = 'ez-bar-biceps-curl';
update exercise_template
   set title_zh = $zh$农夫步行$zh$,
       how_to_zh = $zh$1. 拿起一对重哑铃、壶铃或杠铃片。
2. 站直，肩部后收，腹部收紧，目光看向前方数英尺处。
3. 缓慢向前行走，同时保持平稳呼吸。
4. 尽可能坚持更久，然后弯曲膝盖将重量放到地面上。
$zh$
 where slug = 'farmers-walk';
update exercise_template
   set title_zh = $zh$杠铃抬腿卧推$zh$,
       how_to_zh = $zh$1. 将杠铃架设在你无需完全伸直手臂即可取下的高度。
2. 加上合适的重量，仰卧在凳上，让额头位于杠铃正下方。
3. 双手略宽于肩，均匀握住杠铃。
4. 肩胛骨后收并贴向凳面，双腿伸直。根据身高不同，大腿后侧、膝盖或小腿应靠在凳沿上。
5. 收紧腹部，取下杠铃并移到胸部上方。
6. 吸气，将杠铃下放至胸部。
7. 稍作停顿，呼气时将杠铃推至顶部。
8. 吸气，按建议次数重复。
$zh$
 where slug = 'feet-up-bench-press-barbell';
update exercise_template
   set title_zh = $zh$消防栓式$zh$,
       how_to_zh = $zh$1. 双手和双膝撑地。膝盖位于髋部下方，肩、肘、腕成一直线。
2. 手掌平贴地面，收紧腹部使背部保持中立位。
3. 屈曲右腿，但不要伸直膝关节。
4. 吸气，将右腿向体侧抬起。在活动度和力量允许的范围内尽量抬高，抬到顶部时呼气。不要让躯干随膝盖转动；保持髋部正对前方。
5. 吸气时将右腿放回起始位置。
6. 完成后，换另一条腿做相同的次数。
$zh$
 where slug = 'fire-hydrants';
update exercise_template
   set title_zh = $zh$杠铃地板卧推$zh$,
       how_to_zh = $zh$1. 将杠铃放在深蹲架上，高度约离地一英尺。
2. 将深蹲架的安全杆设在（躺在地面时的）躯干高度。
3. 平躺在地面上，让杠铃位于额头上方。
4. 向上伸手，以正握均匀握住杠铃。
5. 肩胛骨后收，收紧腹部并吸气。
6. 锁紧手肘将杠铃取下。
7. 将杠铃移到胸部上方，再次吸气。
8. 下放杠铃，直到手肘接触地面。
9. 将杠铃推起，接近顶部时呼气。
$zh$
 where slug = 'floor-press-barbell';
update exercise_template
   set title_zh = $zh$哑铃地板卧推$zh$,
       how_to_zh = $zh$1. 拿起一对哑铃，坐在地面上。
2. 弯曲手臂将哑铃收近躯干，然后后仰躺下。
3. 保持膝盖弯曲，双脚平贴地面。
4. 将哑铃置于身体两侧，收紧腹部，肩胛骨后收。
5. 吸气，将哑铃向上向内推起，在顶部呼气。
6. 吸气时缓慢将哑铃下放至身体两侧。
$zh$
 where slug = 'floor-press-dumbbell';
update exercise_template
   set title_zh = $zh$地板肱三头肌臂屈伸$zh$,
       how_to_zh = $zh$1. 坐下，弯曲膝盖，双脚平贴地面。
2. 躯干后倾，双手平放在身后地面上。
3. 收紧腹部并吸气。
4. 手掌发力伸直手臂，将臀部抬离地面数英寸。呼气。
5. 缓慢弯曲手臂，吸气时将臀部放回地面。
$zh$
 where slug = 'floor-triceps-dip';
update exercise_template
   set title_zh = $zh$仰卧交替打腿$zh$,
       how_to_zh = $zh$1. 仰卧在地面上，双臂置于身体两侧，手掌平贴地面。
2. 收紧腹部，将双脚抬离地面数英寸。
3. 吸气，开始双脚交替上下摆动，每个方向数英寸。
4. 保持稳定的动作节奏和呼吸。
$zh$
 where slug = 'flutter-kicks';
update exercise_template
   set title_zh = $zh$蛙跳$zh$,
       how_to_zh = $zh$1. 站直，双脚间距宽于髋部，脚尖略微外展。
2. 收紧腹部，手臂前伸，双手位于髋部前方。
3. 吸气，下蹲，保持脚跟接触地面。
4. 下蹲至双手擦到地面。
5. 立即用脚跟尽可能用力蹬地，将身体腾空跃起，在最高点呼气。保持手臂指向地面。
6. 落地时再次吸气，下蹲进入下一次重复。
$zh$
 where slug = 'frog-jumps';
update exercise_template
   set title_zh = $zh$哑铃蛙式臀推$zh$,
       how_to_zh = $zh$1. 拿起一只哑铃，仰卧在地面上。
2. 小心地将哑铃放在腹股沟处，用双手扶住。
3. 双脚并拢，膝盖向外打开。
4. 收紧腹部并吸气。
5. 双脚蹬地，将髋部向天花板方向顶起，在顶部收紧臀部并呼气。
6. 吸气时缓慢将臀部放回地面。
$zh$
 where slug = 'frog-pumps-dumbbell';
update exercise_template
   set title_zh = $zh$前水平支撑$zh$,
       how_to_zh = $zh$1. 向上伸手，以正握均匀握住横杠。双手与肩同宽，手肘伸直。
2. 双脚并拢，收缩股四头肌伸直膝关节。
3. 收缩核心肌群保持脊柱中立。前水平动作的任何阶段都不要弓起下背。
4. 收紧整个上身并吸气。
5. 身体保持绷紧，收紧背阔肌和核心，上身后仰开始前水平动作。
6. 收紧背部、肩部和核心肌群，将整个身体水平抬起。
7. 抬起身体直到达到水平位置并保持，平稳呼吸。
8. 放松身体，缓慢回到起始位置。
$zh$
 where slug = 'front-lever-hold';
update exercise_template
   set title_zh = $zh$前水平抬升$zh$,
       how_to_zh = $zh$1. 向上伸手，以正握均匀握住横杠。双手与肩同宽，手肘伸直。
2. 双脚并拢，收缩股四头肌伸直膝关节。
3. 收缩核心肌群保持脊柱中立。前水平动作的任何阶段都不要弓起下背。
4. 收紧整个上身并吸气。
5. 身体保持绷紧，收紧背阔肌和核心，上身后仰开始前水平动作。
6. 收紧背部、肩部和核心肌群，以水平姿势抬起整个身体。
7. 抬起身体直到达到水平位置，呼气时稍作停顿。
8. 吸气时缓慢回到起始位置。
$zh$
 where slug = 'front-lever-raise';
update exercise_template
   set title_zh = $zh$弹力带前平举$zh$,
       how_to_zh = $zh$1. 取一条两端带握把的弹力带。
2. 双脚踩住弹力带中间，双手抓住两端，手臂置于身体两侧。
3. 肩部后收，收紧腹部并吸气。
4. 手臂以一次流畅的动作在身前抬起，在顶部呼气。
5. 吸气时缓慢将手臂放回身体两侧。
$zh$
 where slug = 'front-raise-band';
update exercise_template
   set title_zh = $zh$杠铃前平举$zh$,
       how_to_zh = $zh$1. 双手正握握住杠铃（掌心朝后）。双手与肩同宽。
2. 站直，肩部后收，收紧腹部。
3. 吸气，保持手肘伸直，在身前举起杠铃。举至重量到达肩部高度并呼气。
4. 将杠铃放回起始位置，下放时吸气。
$zh$
 where slug = 'front-raise-barbell';
update exercise_template
   set title_zh = $zh$绳索前平举$zh$,
       how_to_zh = $zh$1. 将滑轮调到最低位置并装上直杆。
2. 背对绳索器械站立，让直杆位于双腿之间。
3. 正握握住直杆（掌心朝后），绳索从双腿之间穿过。手臂应保持伸直。
4. 肩部后收，收紧上身，膝盖微微弯曲。
5. 吸气，以一次流畅的动作将直杆向前抬起远离身体。
6. 举至直杆到达肩部高度并呼气。保持手臂伸直。
7. 吸气时将手臂放回起始位置。
$zh$
 where slug = 'front-raise-cable';
update exercise_template
   set title_zh = $zh$哑铃前平举$zh$,
       how_to_zh = $zh$1. 拿起一对哑铃，站直。
2. 将哑铃置于大腿前方，掌心朝后。
3. 肩部后收并吸气。
4. 将两只哑铃举至肩部高度。在顶部呼气。
5. 吸气时将哑铃下放至大腿上部。
$zh$
 where slug = 'front-raise-dumbbell';
update exercise_template
   set title_zh = $zh$悬吊带前平举$zh$,
       how_to_zh = $zh$1. 握住悬吊带握把，手臂伸直置于胸前。
2. 身体后倾数度，双脚并拢，收紧腹部。
3. 吸气，将手臂举过头顶，把身体拉回垂直位置。呼气。
4. 身体后倾，吸气时缓慢将手臂放回胸前。
$zh$
 where slug = 'front-raise-suspension';
update exercise_template
   set title_zh = $zh$颈前深蹲$zh$,
       how_to_zh = $zh$1. 将杠铃放在锁骨高度。
2. 微微屈膝下蹲，上胸抵住杠铃，双臂向前伸出。
3. 弯曲右肘，将右前臂抬到杠铃上方，右手放在锁骨上。
4. 弯曲左肘，左手放在锁骨上，正好越过杠铃。
5. 将杠铃置于肩上，挺起胸部，吸气，伸直膝盖取下杠铃。
6. 后退两步，留出足够空间。
7. 吸气，保持躯干直立，屈膝下蹲。
8. 在舒适范围内尽量下蹲，理想情况下蹲到大腿与地面平行。
9. 脚跟着力蹬起站直，接近顶部时呼气。
$zh$
 where slug = 'front-squat';
update exercise_template
   set title_zh = $zh$全蹲$zh$,
       how_to_zh = $zh$1. 将杠铃置于颈后，放在上背肌肉上。
2. 均匀握住杠铃以作支撑。
3. 肩部后收，双脚舒适分开站立，脚尖略微外展。
4. 收紧腹部并吸气。
5. 下蹲，保持脚跟接触地面。
6. 在活动度允许的范围内尽量下蹲，稍作停顿，然后脚跟着力蹬起。
7. 接近顶部时呼气。
$zh$
 where slug = 'full-squat';
update exercise_template
   set title_zh = $zh$臀桥$zh$,
       how_to_zh = $zh$1. 平躺在地面上。
2. 弯曲膝盖，双脚踩实地面。
3. 双臂置于身体两侧以保持平衡。
4. 吸气，脚跟着力蹬地，将髋部向天花板方向顶起。
5. 在顶部收紧臀部，呼气时保持该姿势稍作停顿。
6. 吸气时将臀部放回地面。
$zh$
 where slug = 'glute-bridge';
update exercise_template
   set title_zh = $zh$杠铃臀桥$zh$,
       how_to_zh = $zh$1. 坐在地面上，将装有杠铃片的杠铃滚到髋部上方，然后后仰躺下。
2. 肩部后收，弯曲膝盖，双脚平贴地面，间距约与髋同宽。
3. 双手握住杠铃，将髋部顶住杠铃。
4. 吸气并收紧腹部。
5. 脚跟着力蹬地，收紧臀部将髋部向天花板方向顶起，同时呼气。
6. 在顶部稍作停顿，吸气时缓慢将髋部放回起始位置。握紧杠铃使其保持位置。
7. 重复。
$zh$
 where slug = 'glute-bridge-barbell';
update exercise_template
   set title_zh = $zh$臀腘绳肌屈伸$zh$,
       how_to_zh = $zh$1. 在臀腘绳肌训练器上就位。脚踝垫应抵住跟腱，膝盖放在支撑髋部的平台上。如果你的器械有脚踏板，用前脚掌蹬住脚踏板。
2. 躯干直立，膝盖弯曲，脚踝固定，双臂在胸前交叉，肩胛骨后收，吸气。
3. 保持背部和髋部绷紧，缓慢伸直双腿，让躯干向前下方移动。
4. 尽可能下放，理想情况下放至膝盖几乎完全伸直。
5. 收紧后链肌群弯曲膝盖，将躯干抬回起始位置。接近顶部时呼气。
$zh$
 where slug = 'glute-ham-raise';
update exercise_template
   set title_zh = $zh$固定器械后踢腿$zh$,
       how_to_zh = $zh$1. 选择合适的配重。
2. 身体右侧朝向器械，抓住水平支撑杆。
3. 将右大腿后侧贴在护垫上，位置刚好在膝窝上方。
4. 肩部后收，收紧腹部，呼气时以一次流畅的动作将腿向后伸展。
5. 吸气时缓慢将腿放回起始位置。
6. 完成后，身体旋转 180 度，换左腿做相同的次数。
$zh$
 where slug = 'glute-kickback-machine';
update exercise_template
   set title_zh = $zh$地板后踢腿$zh$,
       how_to_zh = $zh$1. 四肢撑地，手掌平贴地面，双膝支撑下身。
2. 膝盖应位于髋部正下方，腕、肘、肩成一直线。
3. 收紧腹部并吸气。
4. 将右腿向后上方踢起，在顶部收紧臀部并呼气。保持膝盖弯曲。
5. 缓慢将腿放回起始位置并吸气。
6. 一侧训练完成后，换另一条腿做相同的次数。
$zh$
 where slug = 'glute-kickback-on-floor';
update exercise_template
   set title_zh = $zh$杠铃早安式$zh$,
       how_to_zh = $zh$1. 将杠铃架设在约腋窝高度，双手略宽于肩均匀握住。
2. 身体钻到杠铃下方，将杠铃放在下斜方肌上，约与后三角肌齐平。
3. 挺起上背，双手将杠铃压紧。手腕保持伸直，不要让杠铃压在手上。
4. 双脚与髋同宽站稳，髋部前顶取下杠铃。后退几步，留出足够的动作空间。
5. 杠铃紧压上背、双脚踩实地面，吸气，将髋部径直向后推。
6. 上身前倾时保持背部中立，想着把臀部向后推。
7. 保持背部挺直，尽可能前倾躯干。你应感到后链肌群被强烈拉伸。在最低点允许膝盖略微弯曲。
8. 髋部前顶启动向上动作，站直。在顶部呼气。
$zh$
 where slug = 'good-morning-barbell';

-- 0017 fragment 05 — gorilla-row-kettlebell .. jackknife-sit-up
update exercise_template
   set title_zh = $zh$壶铃大猩猩划船$zh$,
       how_to_zh = $zh$1. 将两只重量相同的壶铃放在地面上，站在壶铃前。
2. 俯身并抓住两只壶铃的把手。
3. 适度屈膝，肩胛骨后收，使背部挺直。
4. 深吸一口气，收紧腹部，将一只壶铃划起至肘部与躯干齐平。呼气。
5. 吸气的同时将壶铃放回地面。
6. 立即划起另一只壶铃并呼气。
7. 左右交替，直到完成。
$zh$
 where slug = 'gorilla-row-kettlebell';
update exercise_template
   set title_zh = $zh$哈克深蹲$zh$,
       how_to_zh = $zh$1. 将杠铃放在地面上，站在杠铃前。小腿几乎贴住杠铃。
2. 挺胸并下蹲。
3. 掌心向后抓住杠铃，保持肩胛骨后收。
4. 握紧杠铃，深吸一口气，脚后跟发力起身。
5. 让杠铃贴着大腿和臀部上移。接近顶部时呼气。
6. 肩部后收，目光向前，屈膝屈髋下蹲。
$zh$
 where slug = 'hack-squat';
update exercise_template
   set title_zh = $zh$固定器械哈克深蹲$zh$,
       how_to_zh = $zh$1. 为器械加上配重。
2. 进入器械内，肩部抵住靠垫。
3. 双脚以舒适的深蹲站距踩在下方的踏板上。
4. 肩部后收，收紧腹部。
5. 伸直膝盖解锁重量，并取下安全插销。
6. 吸气并屈膝下蹲。
7. 下蹲至膝盖呈 90 度角。
8. 脚后跟发力伸直双腿，接近顶部时呼气。
9. 完成后扣上安全装置，放回重量，放松身体。
$zh$
 where slug = 'hack-squat-machine';
update exercise_template
   set title_zh = $zh$弹力带锤式弯举$zh$,
       how_to_zh = $zh$1. 取一条环形或两端开口的弹力带，踩住中间，双手抓住两端。
2. 站直，手臂伸直，手腕保持中立（朝向身体）。
3. 吸气，缓慢弯曲手臂。
4. 弯举弹力带，直到手腕略高于肘部，呼气。肘部贴近身体两侧。
5. 吸气的同时完全伸直手臂。
$zh$
 where slug = 'hammer-curl-band';
update exercise_template
   set title_zh = $zh$绳索锤式弯举$zh$,
       how_to_zh = $zh$1. 选择合适的重量，将滑轮调至最低位置。
2. 在滑轮上安装绳索把手。
3. 俯身抓住绳索把手的两端。双手保持中立（掌心相对）。
4. 站直并后退一步，将重量从配重片堆上提起，收紧腹部，肩胛骨后收。
5. 吸气，弯曲手臂将绳索提至胸前。肘部贴近身体两侧。
6. 弯曲手臂直到手腕略高于肘部，呼气。
7. 缓慢伸直手臂并吸气。
$zh$
 where slug = 'hammer-curl-cable';
update exercise_template
   set title_zh = $zh$哑铃锤式弯举$zh$,
       how_to_zh = $zh$1. 拿起一对哑铃，站直。
2. 手臂放在身体两侧，手腕保持中立（掌心朝向身体）。
3. 肩部后收并吸气。
4. 同时弯举两只哑铃，直到手腕略高于肘部。呼气。
5. 吸气的同时完全伸直手臂。
$zh$
 where slug = 'hammer-curl-dumbbell';
update exercise_template
   set title_zh = $zh$倒立支撑$zh$,
       how_to_zh = $zh$1. 站直，手臂举过头顶，收紧核心。
2. 吸气并向前倾，双手撑在地面上。
3. 借助产生的动量将双腿伸向天花板。
4. 保持倒立姿势。
$zh$
 where slug = 'handstand-hold';
update exercise_template
   set title_zh = $zh$倒立俯卧撑$zh$,
       how_to_zh = $zh$1. 双手平放在地面上，将双腿举向天花板，进入倒立姿势。可以靠墙支撑以获得更好的平衡。
2. 进入姿势后，吸气并屈肘下放身体。
3. 缓慢下放，当头部离地面几英寸时停住。
4. 伸直肘部撑起并呼气。
$zh$
 where slug = 'handstand-push-up';
update exercise_template
   set title_zh = $zh$悬垂翻$zh$,
       how_to_zh = $zh$1. 站直，以正握（掌心向后）握住杠铃。握距应宽于肩。
2. 肩部后收，收紧腹部，双脚以舒适姿势站稳。
3. 吸气，将杠铃向前上方发力提起。
4. 立即下蹲，以颈前架位接住杠铃。肘部弯曲，指尖托住架在肩上的杠铃。
5. 脚后跟发力伸直膝盖站起，在顶部呼气。
6. 握住杠铃，吸气的同时小心地将其放回起始位置。
$zh$
 where slug = 'hang-clean';
update exercise_template
   set title_zh = $zh$悬垂抓举$zh$,
       how_to_zh = $zh$1. 以正握（掌心向后）抓住已上片的杠铃。
2. 站直并伸直手臂。
3. 收紧腹部并吸气。
4. 屈髋俯身，直到杠铃略高于膝盖。
5. 髋部前送，同时将重量举过头顶，屈膝下蹲。
6. 肘部伸直，在头顶接住杠铃。
7. 脚后跟发力，保持手臂伸直站起。在顶部呼气。
$zh$
 where slug = 'hang-snatch';
update exercise_template
   set title_zh = $zh$悬垂举膝$zh$,
       how_to_zh = $zh$1. 向上伸手，以正握（掌心向前）抓住引体向上杆。双手与肩同宽。
2. 双腿并拢，收紧腹部，肩部后收。
3. 吸气并屈膝抬起双腿。
4. 以流畅的动作将双腿尽可能抬高并呼气。
5. 吸气的同时缓慢伸直双腿。不要让下背拱起。
$zh$
 where slug = 'hanging-knee-raise';
update exercise_template
   set title_zh = $zh$悬垂举腿$zh$,
       how_to_zh = $zh$1. 向上伸手，以均匀的正握（掌心向前）抓住引体向上杆。
2. 吸气，收紧腹部，双脚离地，将身体悬于空中。
3. 保持双腿伸直并抬起。
4. 在顶部稍作停顿并呼气。
5. 吸气的同时保持身体稳定，缓慢放下双腿。
$zh$
 where slug = 'hanging-leg-raise';
update exercise_template
   set title_zh = $zh$触踵$zh$,
       how_to_zh = $zh$1. 仰卧在地面上，屈膝，双脚并拢平放。
2. 手臂放在身体两侧，吸气。
3. 躯干向左侧卷起，用手触碰左脚踝。
4. 伸展上身，再次吸气，然后向右侧卷起。
5. 左右交替，直到完成。
$zh$
 where slug = 'heel-taps';
update exercise_template
   set title_zh = $zh$哑铃六角推举$zh$,
       how_to_zh = $zh$1. 拿起一对哑铃，最好是六角形哑铃。
2. 坐在平板健身凳上，将哑铃放在大腿上。
3. 躺下，同时让哑铃贴近躯干。
4. 躺下的过程中伸直手臂，将哑铃相互挤压。
5. 肩胛骨后收，深吸一口气，收紧腹部。
6. 将哑铃下放至上腹部并稍作停顿。
7. 推起哑铃伸直手臂并呼气。
$zh$
 where slug = 'hex-press-dumbbell';
update exercise_template
   set title_zh = $zh$高抬腿跳$zh$,
       how_to_zh = $zh$1. 站直，手臂放在身体两侧，双腿伸直，双脚分开几英寸。
2. 肩部后收，收紧腹部，吸气。
3. 将左膝抬向胸口，同时左臂向后摆。同时弯曲右臂，将手放在脸侧。
4. 呼气的同时将左脚放回地面，右臂回到身体一侧。
5. 吸气，立即抬起另一侧膝盖至胸口，同时弯曲左臂。
6. 左右交替，自始至终保持稳定节奏。
$zh$
 where slug = 'high-knee-skips';
update exercise_template
   set title_zh = $zh$高抬腿$zh$,
       how_to_zh = $zh$1. 站直，肩部后收，收紧腹部，目光向前。
2. 吸气，将右膝抬向胸口，同时右臂摆到身后。
3. 放下右膝，立即抬起另一侧膝盖，左臂摆到身后。
4. 交替将膝盖抬向胸口，同时保持稳定节奏。
$zh$
 where slug = 'high-knees';
update exercise_template
   set title_zh = $zh$HIIT$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）
$zh$
 where slug = 'hiit';
update exercise_template
   set title_zh = $zh$徒步$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）
$zh$
 where slug = 'hiking';
update exercise_template
   set title_zh = $zh$绳索髋外展$zh$,
       how_to_zh = $zh$1. 将绳索滑轮调至最低位置，安装脚踝绑带，并选择合适的重量。
2. 将绑带套在右脚踝上，站起，左肩朝向器械。
3. 肩部后收，稍远离器械将重量解锁。可以扶住器械保持平衡。
4. 收紧腹部，右脚稍稍离地。
5. 吸气，以流畅的动作将右腿向侧面抬起，在动作顶端呼气。
6. 吸气的同时缓慢将腿收回并重复。
7. 完成后，将绑带套在左脚踝上，站起，右肩朝向滑轮，重复相同的次数。
$zh$
 where slug = 'hip-abduction-cable';
update exercise_template
   set title_zh = $zh$固定器械髋外展$zh$,
       how_to_zh = $zh$1. 选择合适的配重并坐下。
2. 肩部后收，抓住身体两侧的把手。
3. 双脚踩在踏板上，让大腿下段外侧贴住靠垫。
4. 吸气，以流畅的动作尽可能将双腿向外分开，呼气。
5. 吸气的同时将双膝并拢。
$zh$
 where slug = 'hip-abduction-machine';
update exercise_template
   set title_zh = $zh$绳索髋内收$zh$,
       how_to_zh = $zh$1. 将绳索滑轮调至最低位置，安装脚踝绑带，并选择合适的重量。
2. 将绑带套在右脚踝上，站起，右肩朝向器械。
3. 远离器械走一步。目标是让右腿在身体一侧时重量解锁。可以扶住器械保持平衡。
4. 收紧腹部，右脚稍稍离地。
5. 吸气，将右腿向内收，直到右脚位于左脚前方。呼气。
6. 吸气的同时让右腿回到身体一侧。
7. 重复。
8. 完成后，将绑带套在左脚踝上，站起，左肩朝向滑轮，远离一步，重复相同的次数。
$zh$
 where slug = 'hip-adduction-cable';
update exercise_template
   set title_zh = $zh$固定器械髋内收$zh$,
       how_to_zh = $zh$1. 选择合适的配重。
2. 坐下，让大腿内侧贴住器械靠垫。双脚放在下方的踏板上。
3. 抓住身体两侧的把手，肩胛骨后收，吸气。
4. 呼气的同时收紧大腿内侧肌肉，将靠垫并拢。
5. 吸气的同时将双腿回到起始位置。
$zh$
 where slug = 'hip-adduction-machine';
update exercise_template
   set title_zh = $zh$杠铃臀推$zh$,
       how_to_zh = $zh$1. 坐在地面上，将已上片的杠铃放在髋部上方。
2. 将上背靠在平板健身凳的边缘。
3. 屈膝，双脚平放在地面上。
4. 双手放在杠铃上方并握紧。
5. 收紧腹部并吸气。
6. 收紧臀部，脚后跟发力，将杠铃推向天花板。在顶部呼气。
7. 将髋部放回地面并吸气。
$zh$
 where slug = 'hip-thrust-barbell';
update exercise_template
   set title_zh = $zh$哑铃臀推$zh$,
       how_to_zh = $zh$1. 坐在地面上，身后放一张平板健身凳，身旁放一只哑铃。
2. 向后靠，将上背靠在健身凳边缘。
3. 双脚约与髋同宽，平放在地面上。
4. 拿起哑铃放在髋部上方，双手扶稳。
5. 吸气，收紧腹部，脚后跟发力将髋部推向天花板。
6. 当膝盖、髋部与上身成一条直线时稍作停顿。呼气。
7. 保持腹部收紧，缓慢放下髋部。下放过程中吸气。
8. 重复。
$zh$
 where slug = 'hip-thrust-dumbbell';
update exercise_template
   set title_zh = $zh$固定器械臀推$zh$,
       how_to_zh = $zh$1. 选择或加上合适的重量。
2. 向后靠在器械上，手臂放在身体两侧，上背贴住靠垫。
3. 将绑带或腰带固定在髋部上方。
4. 深吸一口气，收紧腹部。
5. 脚后跟发力将髋部向天花板伸展。在顶部收紧臀部并保持片刻，同时呼气。
6. 吸气的同时缓慢将臀部放回起始位置。
$zh$
 where slug = 'hip-thrust-machine';
update exercise_template
   set title_zh = $zh$史密斯机臀推$zh$,
       how_to_zh = $zh$1. 将史密斯机的杠铃杆调至较低位置，低到足以钻到下方。
2. 为杠铃杆加上合适的配重，并垫上护垫以防髋部不适。
3. 在距杠铃杆约一英尺处放置一张平板健身凳，与杠铃杆平行或垂直（可自行调整找到最合适的位置）。
4. 坐在地面上，向后靠，将肩胛骨靠在健身凳上。杠铃杆应位于髋部正上方。
5. 屈膝，双脚踩在地面上。
6. 抓住杠铃杆，将髋部顶住护垫，收紧腹部。
7. 吸气，脚后跟发力将髋部向天花板抬起，直到与膝盖和上身成一条直线。在顶部呼气。
8. 吸气的同时缓慢将臀部放回地面。
$zh$
 where slug = 'hip-thrust-smith-machine';
update exercise_template
   set title_zh = $zh$空心摇摆$zh$,
       how_to_zh = $zh$1. 仰卧在训练垫上。双手放在身体两侧，双脚并拢，双腿伸直。
2. 收紧腹部，就像要开始做卷腹一样。这样会让下背贴住训练垫。
3. 双腿并拢，收紧大腿肌肉，将双脚抬离地面几英寸。保持双腿伸直。
4. 将头部抬离地面几英寸，手臂向后伸过头顶。
5. 尽可能长时间保持该姿势，并均匀呼吸。
$zh$
 where slug = 'hollow-rock';
update exercise_template
   set title_zh = $zh$杠铃上斜卧推$zh$,
       how_to_zh = $zh$1. 仰卧在上斜凳上，以均匀的正握抓住杠铃杆。杠铃杆应足够近，无需过度伸展身体即可解锁。
2. 肩部后收，收紧腹部，双脚踩在地面上。
3. 吸气，伸直肘部解锁杠铃。
4. 将杠铃移到胸部上方，再吸一口气。
5. 将重量下放至胸部中段并停顿片刻。
6. 沿直线推起杠铃，接近顶部时呼气。
7. 完成后，小心地将杠铃移到头顶上方放回架上，然后放松。
$zh$
 where slug = 'incline-bench-press-barbell';
update exercise_template
   set title_zh = $zh$哑铃上斜卧推$zh$,
       how_to_zh = $zh$1. 将健身凳调至 45 度上斜，拿起一对哑铃并坐下。
2. 将哑铃放在大腿上方，向后躺下，同时用腿将哑铃踢到躯干上方。
3. 将哑铃放到身体两侧，双脚踩在地面上，肩部后收，吸气。肘部稍微内收。
4. 将两只哑铃向天花板推起，在顶部轻轻相碰。呼气。
5. 将哑铃下放至身体两侧，下放过程中吸气。
$zh$
 where slug = 'incline-bench-press-dumbbell';
update exercise_template
   set title_zh = $zh$史密斯机上斜卧推$zh$,
       how_to_zh = $zh$1. 将一张上斜凳放在史密斯机下方。躺下时杠铃杆应位于胸部中段正上方。
2. 将杠铃杆设置到手不用完全伸直即可够到的高度。
3. 躺下，以正握（掌心向前）抓住杠铃杆，将肩胛骨压入健身凳。
4. 收紧腹部，将杠铃杆向上推起，同时旋转以解除安全锁。
5. 吸气，将杠铃杆下放至胸部。
6. 将杠铃杆推回顶部并呼气。
7. 完成后，将杠铃杆放回架上。
$zh$
 where slug = 'incline-bench-press-smith-machine';
update exercise_template
   set title_zh = $zh$哑铃上斜飞鸟$zh$,
       how_to_zh = $zh$1. 拿起一对哑铃，坐在上斜健身凳的底端。
2. 将哑铃放在大腿上方，缓慢向后躺下。
3. 将哑铃举到胸部上方并伸直手臂。
4. 肩部后收并吸气。
5. 将手臂向身体两侧展开，直到肘部与躯干齐平。肘部保持微屈。
6. 将手臂向内收拢，挤压胸肌，在顶部让哑铃相碰。呼气。
$zh$
 where slug = 'incline-chest-fly-dumbbell';
update exercise_template
   set title_zh = $zh$固定器械上斜推胸$zh$,
       how_to_zh = $zh$1. 加上适量的配重。
2. 调整座椅高度，使坐下后能舒适地抓住把手并保持肘部内收。
3. 坐下，双脚踩在地面上，抓住把手。
4. 肩胛骨后收，收紧腹部，吸气。
5. 以流畅的动作将把手向上、向头顶方向推起，在顶部呼气。
6. 吸气的同时缓慢弯曲手臂。
$zh$
 where slug = 'incline-chest-press-machine';
update exercise_template
   set title_zh = $zh$上斜俯卧撑$zh$,
       how_to_zh = $zh$1. 将双手放在稳固物体（跳箱、健身凳或椅子）的边缘。
2. 像做标准俯卧撑一样绷直身体。
3. 肩部后收，收紧臀部。
4. 吸气，将身体下放至所用物体处，在最低点让胸部触碰物体。
5. 将自己推回顶部，呼气的同时完全伸直手臂。
$zh$
 where slug = 'incline-push-ups';
update exercise_template
   set title_zh = $zh$反向划船$zh$,
       how_to_zh = $zh$1. 将杠铃杆设置在约髋部高度的位置用于划船。可以使用史密斯机。
2. 以正握抓住杠铃杆，将身体钻到杆下。
3. 手臂伸直，杠铃杆位于胸部上方，伸展身体，让下半身以脚后跟保持平衡。
4. 收紧臀部和腹部，挺胸，吸气。身体应像箭一样笔直。
5. 通过肘部发力将身体拉向杠铃杆。让杠铃杆触碰胸部，肘部不要外翻。呼气。
6. 吸气的同时缓慢下放身体回到起始位置。
$zh$
 where slug = 'inverted-row';
update exercise_template
   set title_zh = $zh$固定器械分动式推胸$zh$,
       how_to_zh = $zh$1. 为器械加上适量的配重。
2. 调整座椅高度。推起时肘部不应外翻。
3. 坐下，以正握（掌心向下）抓住把手。
4. 肩部后收，双脚踩在地面上，吸气。
5. 将把手向前、向上推起，在手臂伸直时呼气。
6. 吸气的同时弯曲肘部。
$zh$
 where slug = 'iso-lateral-chest-press-machine';
update exercise_template
   set title_zh = $zh$固定器械分动式高位划船$zh$,
       how_to_zh = $zh$1. 为器械加上配重，调整腿部靠垫使双腿贴紧。
2. 坐下并抓住把手。
3. 肩部后收，收紧腹部，吸气。
4. 将把手拉向躯干，挤压背部肌肉，呼气。
5. 吸气的同时缓慢伸直手臂。
$zh$
 where slug = 'iso-lateral-high-row-machine';
update exercise_template
   set title_zh = $zh$分动式低位划船$zh$,
       how_to_zh = $zh$1. 加上适量的配重。
2. 坐下，让腹部和胸部贴住靠垫。
3. 向前伸手抓住两个把手。
4. 肩胛骨后收，深吸一口气，收紧腹部。
5. 将两个把手拉至肘部位于身体两侧，呼气的同时挤压背部肌肉。
6. 吸气的同时缓慢伸直手臂。
$zh$
 where slug = 'iso-lateral-low-row';
update exercise_template
   set title_zh = $zh$固定器械分动式划船$zh$,
       how_to_zh = $zh$1. 为器械加上适量的配重。
2. 调整座椅高度，使坐下时躯干贴住前方靠垫。
3. 坐下，双脚平放，躯干贴住靠垫，抓住把手。
4. 肩部后收并吸气。
5. 将把手拉向身体两侧，在动作顶端挤压背部并呼气。
6. 保持肩部后收，缓慢伸直手臂并吸气。
$zh$
 where slug = 'iso-lateral-row-machine';
update exercise_template
   set title_zh = $zh$悬吊带折刀$zh$,
       how_to_zh = $zh$1. 将双脚固定在悬吊带的把手上。
2. 身体伸展成俯卧撑姿势，手臂伸直或弯曲，肩部后收，腹部收紧。
3. 吸气，屈膝收腿，让膝盖靠近肘部。呼气。
4. 吸气的同时缓慢伸直膝盖。
$zh$
 where slug = 'jack-knife-suspension';
update exercise_template
   set title_zh = $zh$折刀仰卧起坐$zh$,
       how_to_zh = $zh$1. 平躺在地面上，双腿伸直，手臂放在身体两侧。脚后跟、双腿、臀部、上背、头部和手臂都应贴住地面。
2. 收紧腹部，屈膝的同时抬起双腿。
3. 同时抬起躯干，将手臂伸向下半身。呼气。
4. 将身体放回起始位置，下放过程中吸气。
$zh$
 where slug = 'jackknife-sit-up';

-- 0017 fragment 06 — jm-press-barbell .. leg-press-machine
update exercise_template
   set title_zh = $zh$杠铃 JM 卧推$zh$,
       how_to_zh = $zh$1. 将杠铃放在无需完全伸直手臂即可够到的高度。
2. 仰卧在长凳上，向上伸手，以与肩同宽的握距握住杠铃并取下。
3. 手臂伸直，将杠铃置于胸部上方，与标准卧推相同。
4. 双脚踩实地面，收紧肩胛骨，深吸一口气，收紧腹部。
5. 缓慢弯曲手肘，将杠铃下放至上胸。
6. 稍作停顿，呼气的同时完全伸直手臂。
$zh$
 where slug = 'jm-press-barbell';

update exercise_template
   set title_zh = $zh$跳绳$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）$zh$
 where slug = 'jump-rope';

update exercise_template
   set title_zh = $zh$跳跃耸肩$zh$,
       how_to_zh = $zh$1. 以正握（掌心向后）握住杠铃，站直。双手应位于大腿外侧。
2. 肩部后收，收紧腹部。
3. 以髋部为轴，躯干略向前倾。
4. 吸气，膝盖微屈，脚跟发力起跳。
5. 立即尽最大幅度耸肩，呼气。
$zh$
 where slug = 'jump-shrug';

update exercise_template
   set title_zh = $zh$跳跃深蹲$zh$,
       how_to_zh = $zh$1. 站直，双脚与肩同宽，脚尖略微外展。
2. 肩部后收，收紧腹部，双手置于躯干前方。
3. 吸气，下蹲至一半深度。
4. 脚跟发力向上并立即尽力跳高，同时呼气并将手臂向身体两侧及身后摆动。
5. 落地时再次吸气，并再次下蹲。
$zh$
 where slug = 'jump-squat';

update exercise_template
   set title_zh = $zh$开合跳$zh$,
       how_to_zh = $zh$1. 站直，双臂垂于体侧，双腿伸直，双脚并拢。
2. 收紧腹部，吸气。
3. 跳起并将双脚分开，同时双臂向两侧展开并举过头顶。
4. 再次跳起，双脚并拢，双臂回到体侧。呼气。
5. 保持有节奏地重复，离地仅数厘米，并规律呼吸。
$zh$
 where slug = 'jumping-jack';

update exercise_template
   set title_zh = $zh$跳跃弓步$zh$,
       how_to_zh = $zh$1. 站直，双脚分开数厘米，双臂垂于体侧，肩部后收。
2. 收紧腹部，吸气。
3. 垂直跳起，同时右腿向前、左腿向后。
4. 前脚与左脚前掌落地时，立即下蹲成弓步。
5. 下蹲至前侧大腿几乎与地面平行。
6. 前脚跟发力向上并立即跳起。起身时呼气。
7. 在空中交换双腿位置，吸气，再次下蹲成弓步。
8. 持续跳跃并交换双腿位置，中间完成一次弓步。
$zh$
 where slug = 'jumping-lunge';

update exercise_template
   set title_zh = $zh$壶铃绕体$zh$,
       how_to_zh = $zh$1. 右手持壶铃，站直，双脚与髋同宽，肩部后收。
2. 收紧腹部，吸气。
3. 将壶铃在身前移向左侧并换手，用左手接住。
4. 继续旋转，将壶铃向身后绕体移动。
5. 壶铃到臀部位置时，右手向后伸接住壶铃，继续同方向旋转。
6. 壶铃绕腰旋转时持续换手，保持均匀呼吸。保持稳定节奏，腹部持续收紧。
7. 一个方向旋转完成后，反方向完成相同次数。
$zh$
 where slug = 'kettlebell-around-the-world';

update exercise_template
   set title_zh = $zh$壶铃翻$zh$,
       how_to_zh = $zh$1. 将壶铃放在地面上。
2. 站在壶铃前，双脚与髋同宽。
3. 屈膝并前倾躯干，右手握住壶铃。
4. 收紧腹部，吸气。
5. 脚跟发力伸直膝盖，同时将壶铃沿贴近身体的竖直直线拉起。
6. 壶铃到髋部高度时，髋部前顶，将壶铃向上带起。
7. 屈臂让壶铃落在肩上，贴住前臂上侧与肱二头肌。呼气。
8. 将壶铃放回地面，下放过程中或下一次动作开始前吸气。
9. 完成后，换左手握住壶铃，完成相同次数。
$zh$
 where slug = 'kettlebell-clean';

update exercise_template
   set title_zh = $zh$壶铃弯举$zh$,
       how_to_zh = $zh$1. 双手各持一只壶铃置于体侧，手臂伸直，掌心向前。
2. 肩部后收，收紧腹部。
3. 吸气并弯举壶铃，屈臂至手腕略高于手肘。顶端呼气。
4. 缓慢伸直手臂，下放时吸气。
5. 重复。
$zh$
 where slug = 'kettlebell-curl';

update exercise_template
   set title_zh = $zh$壶铃高脚杯深蹲$zh$,
       how_to_zh = $zh$1. 握住壶铃的把手两侧，或用掌心托住铃体、把手朝下。
2. 屈肘将壶铃举至胸前。
3. 肩部后收，双脚以舒适站距站立，脚尖略微外展。
4. 吸气，收紧腹部。
5. 屈膝下蹲，下蹲过程中保持躯干直立。
6. 下蹲至大腿与地面平行，手肘位于两腿之间。
7. 在最低点稍作停顿。
8. 脚跟发力起身，壶铃贴近身体。
9. 伸直双腿时呼气。
$zh$
 where slug = 'kettlebell-goblet-squat';

update exercise_template
   set title_zh = $zh$壶铃光环$zh$,
       how_to_zh = $zh$1. 握住壶铃把手两侧，手腕保持中立，拇指朝前。
2. 站起并将壶铃翻转至底部朝上，掌心朝向身体，手肘弯曲约 90 度。
3. 以舒适站姿站立，挺胸，收紧腹部。
4. 吸气，将壶铃向后方绕头部右侧移动。此时左前臂会经过头顶。
5. 壶铃移向头后时，抬起右前臂继续旋转。
6. 将壶铃回到胸前起始位置，完成一次动作。呼气。
7. 吸气，反向绕头旋转壶铃。
$zh$
 where slug = 'kettlebell-halo';

update exercise_template
   set title_zh = $zh$壶铃高位拉$zh$,
       how_to_zh = $zh$1. 将壶铃放在地面上。
2. 双脚站距宽于肩，脚尖外展。
3. 屈膝，双手握住壶铃把手。保持背部中立。
4. 吸气，脚跟发力伸展手臂。
5. 壶铃到髋部高度时，利用惯性将壶铃竖直上拉成直立划船，顶端呼气。
6. 缓慢伸直手臂，屈膝屈髋将壶铃放回地面，下放过程中或下一次动作开始前吸气。
$zh$
 where slug = 'kettlebell-high-pull';

update exercise_template
   set title_zh = $zh$壶铃肩部推举$zh$,
       how_to_zh = $zh$1. 握住壶铃并举至肩部高度。保持手肘弯曲，壶铃贴住前臂上侧与肱二头肌。
2. 肩部后收，收紧腹部，双脚以舒适姿势站立。
3. 吸气并将壶铃竖直上推，完全伸直手臂并呼气。
4. 缓慢下放至体侧，同时吸气。
5. 重复。
6. 完成后，换另一只手握住壶铃，完成相同次数。
$zh$
 where slug = 'kettlebell-shoulder-press';

update exercise_template
   set title_zh = $zh$壶铃抓举$zh$,
       how_to_zh = $zh$1. 将壶铃放在身前。
2. 双脚与肩同宽，脚尖略微外展。
3. 屈膝前倾，握住壶铃。
4. 站直，将壶铃置于身前。
5. 肩部后收，收紧腹部，吸气。
6. 以髋部为轴，将壶铃向后摆至两腿之间。
7. 伸展膝盖与髋部产生惯性，将壶铃向前上方带起，一次流畅地举过头顶。
8. 壶铃举过头顶时完全伸直手臂，呼气。
9. 沿直线下放壶铃，同时吸气。
10. 重复。
11. 完成后，换另一只手臂完成相同次数。
$zh$
 where slug = 'kettlebell-snatch';

update exercise_template
   set title_zh = $zh$壶铃摆动$zh$,
       how_to_zh = $zh$1. 握住壶铃把手，手腕保持中立（掌心相对）。
2. 站直，壶铃置于髋部前方。双脚应与肩同宽或略宽。
3. 肩部后收，收紧腹部，吸气。
4. 以髋部为轴，臀部后移。壶铃应摆至两腿之间。
5. 用力伸展髋部，将壶铃向前摆至肩部高度，呼气。
6. 下放壶铃，立即再次以髋部为轴，让壶铃回到两腿之间。
$zh$
 where slug = 'kettlebell-swing';

update exercise_template
   set title_zh = $zh$壶铃土耳其起立$zh$,
       how_to_zh = $zh$1. 仰卧地面，右膝弯曲，右脚掌平贴地面。左腿伸直。
2. 右手持壶铃，保持手腕、手肘与肩部在一条垂直线上。
3. 左臂向体侧展开，手掌平贴地面。
4. 收紧腹部，吸气，将躯干抬离地面。保持右臂伸直，壶铃位于肩关节上方。用左臂支撑身体，直到躯干竖直坐起。
5. 保持壶铃位于右肩上方、左手支撑身体，屈左腿将膝盖放在地面上，撑起身体。
6. 进一步抬高躯干，左手离开地面。
7. 摆正髋部形成稳固的弓步姿势，再次吸气，抬起左膝，左脚踩地。
8. 伸展膝盖与髋部站起。保持壶铃位于肩部上方，不要弯曲手肘。
9. 反向还原：向后撤步成弓步，左脚抬离地面，以左膝着地，将左腿转到身后。
10. 左手放在地面上，左腿向前伸直，在不伸直右膝的情况下坐回地面。
11. 弯曲左臂下放躯干，仰卧回到起始位置。
$zh$
 where slug = 'kettlebell-turkish-get-up';

update exercise_template
   set title_zh = $zh$摆荡引体向上$zh$,
       how_to_zh = $zh$1. 向上伸手，以正握（掌心向前）握住引体向上杆。
2. 略微抬腿，臀部后移，使身体轻微摆动以产生惯性。
3. 利用产生的惯性，让双腿向后摆动，使背部进入超伸状态。
4. 让双腿向前摆动，继续积累惯性。
5. 弯曲手肘将身体拉起。下巴过杆，身体伸直，借惯性略微后倾，类似反向划船。
6. 立即下放身体，保持身体后倾姿势。
7. 手臂几乎完全伸直时，放下双腿并向后摆动，臀部后移，使脊柱形成反弓。
8. 再次向前摆腿，利用惯性第二次将身体拉起。
9. 持续上下摆动，每次动作都利用惯性从背部弯曲过渡到超伸。
$zh$
 where slug = 'kipping-pull-up';

update exercise_template
   set title_zh = $zh$双杠举膝$zh$,
       how_to_zh = $zh$1. 站进船长椅内，双脚踩在踏板或台阶上，背部贴住靠垫，前臂平放在两侧带垫的双杠上。
2. 肩部后收，收紧腹部。
3. 离开踏板或台阶，用上肢支撑身体。保持肩部位置，避免含胸。
4. 吸气并收紧腹部，一次流畅地将膝盖抬至最高。顶端呼气。
5. 将膝盖下放回起始位置，下放过程中伸直双腿，在下背开始反弓前停止。下放时吸气。
$zh$
 where slug = 'knee-raise-parallel-bars';

update exercise_template
   set title_zh = $zh$跪姿弹力带下拉$zh$,
       how_to_zh = $zh$1. 将弹力带固定在高处。
2. 双手握住弹力带两端把手，后退一步并跪下。
3. 躯干朝弹力带固定点方向前倾。
4. 肩部后收，吸气。
5. 将弹力带拉向肩部，手肘内收并与躯干保持在同一平面。呼气。
6. 缓慢伸直手臂，同时吸气。
$zh$
 where slug = 'kneeling-pulldown-band';

update exercise_template
   set title_zh = $zh$跪姿俯卧撑$zh$,
       how_to_zh = $zh$1. 双手和双膝撑地。
2. 身体前倾，双手以舒适的位置撑地。
3. 收紧腹部，吸气。
4. 弯曲手肘下降身体。
5. 下降至脸部离地约一英寸处并停顿。
6. 撑起身体回到起始位置，呼气。
$zh$
 where slug = 'kneeling-push-up';

update exercise_template
   set title_zh = $zh$L 字支撑$zh$,
       how_to_zh = $zh$1. 在船长椅或双杠臂屈伸架上就位。
2. 双手均匀握住把手，伸直手臂。
3. 将身体悬空支撑，收紧腹部。
4. 吸气，抬起双腿至与地面平行。
5. 保持该姿势 15 至 60 秒后放松。
$zh$
 where slug = 'l-sit-hold';

update exercise_template
   set title_zh = $zh$地雷管 180 度转体$zh$,
       how_to_zh = $zh$1. 将杠铃一端固定在地雷管底座上，另一端装上杠铃片。
2. 握住杠铃套筒，掌心托住底端。
3. 站直，将杠铃置于身体右侧，手臂伸直，收紧腹部。
4. 吸气，弯曲手肘将杠铃举至面部高度。
5. 立即将杠铃向左侧下放，同时伸直手臂。呼气。
6. 再次吸气，向相反方向举起杠铃。
$zh$
 where slug = 'landmine-180';

update exercise_template
   set title_zh = $zh$地雷管划船$zh$,
       how_to_zh = $zh$1. 将杠铃一端固定在地雷管底座上。
2. 在杠铃另一端加上适量铃片。
3. 取一个 V 形把手，将其置于杠铃下方。
4. 双手握住把手，将其紧贴杠铃杆末端（套筒开始之前的位置）。
5. 屈膝，收紧肩胛骨，收紧腹部。
6. 将杠铃抬离地面数厘米，再次吸气。
7. 将杠铃划向上腹部，呼气并稍作停顿。
8. 伸臂下放杠铃并吸气。不要让杠铃停在地面上。
$zh$
 where slug = 'landmine-row';

update exercise_template
   set title_zh = $zh$地雷管深蹲推举$zh$,
       how_to_zh = $zh$1. 将杠铃一端固定在地雷管底座上，另一端装上杠铃片。
2. 俯身用双手握住杠铃的自由端。
3. 直起身体，双手并拢置于胸前。
4. 双脚以适合深蹲的舒适站距站立。
5. 收紧腹部，吸气，下蹲。
6. 下蹲至大腿与地面平行，脚跟发力起身。
7. 伸直双腿时立即将杠铃向上推过头顶，顶端呼气。
8. 缓慢将杠铃下放至胸前，吸气，再次下蹲。
$zh$
 where slug = 'landmine-squat-and-press';

update exercise_template
   set title_zh = $zh$弹力带高位下拉$zh$,
       how_to_zh = $zh$1. 将弹力带固定在高处，例如引体向上杆上。
2. 双手握住弹力带两端，伸直手臂，后退拉长弹力带，坐在跳箱或健身房长凳上。也可以跪姿进行。
3. 身体略微朝弹力带固定点方向倾斜。
4. 吸气，将弹力带拉向上胸，在末端收紧背阔肌并呼气。
5. 缓慢伸直手臂，同时吸气。
$zh$
 where slug = 'lat-pulldown-band';

update exercise_template
   set title_zh = $zh$绳索高位下拉$zh$,
       how_to_zh = $zh$1. 调整器械上的膝垫，使其紧贴大腿。
2. 选择能流畅完成至少十次的重量。
3. 双手略宽于肩握杠。掌心向前。
4. 坐下，将双腿固定在膝垫下方。
5. 手臂伸直，肩部后收下沉。
6. 吸气，用手肘将重量下拉。下拉时手肘内收，与躯干保持在同一平面。呼气。
7. 稍作停顿，吸气并完全伸直手臂。
$zh$
 where slug = 'lat-pulldown-cable';

update exercise_template
   set title_zh = $zh$绳索窄握高位下拉$zh$,
       how_to_zh = $zh$1. 在背阔肌下拉器械上装上 V 形把手。
2. 选择合适的配重。
3. 调整腿垫，使双腿紧贴其下方。
4. 以对握（掌心相对）握住 V 形把手，坐下，将大腿置于腿垫下方。
5. 肩部后收，躯干略微后倾。
6. 吸气，将 V 形把手拉向胸部，收紧背部肌肉并呼气。
7. 缓慢伸直手臂，同时吸气。
$zh$
 where slug = 'lat-pulldown-close-grip-cable';

update exercise_template
   set title_zh = $zh$固定器械高位下拉$zh$,
       how_to_zh = $zh$1. 选择合适的配重。
2. 调整腿垫。双腿应紧贴其下方。
3. 站起，以均衡的正握（掌心向前）握住把手。
4. 保持手臂伸直并坐下，将双腿固定在腿垫下方。
5. 肩部后收，吸气。
6. 将把手下拉，手肘内收并与躯干保持在同一平面。呼气。
7. 缓慢伸直手臂，同时吸气。
$zh$
 where slug = 'lat-pulldown-machine';

update exercise_template
   set title_zh = $zh$弹力带侧向行走$zh$,
       how_to_zh = $zh$1. 将环形弹力带套在脚踝或大腿上，位于膝盖上方。
2. 躯干略向前倾，膝盖微屈。
3. 收紧腹部，吸气。
4. 向右侧跨一步，呼气。
5. 再次吸气，沿同一方向再跨一步。
6. 一个方向行走完成后，向左侧走相同的步数，保持均匀呼吸。
$zh$
 where slug = 'lateral-band-walks';

update exercise_template
   set title_zh = $zh$侧向跳箱$zh$,
       how_to_zh = $zh$1. 侧身站在跳箱或平坦的健身房长凳旁。
2. 双脚靠近，双臂垂于体侧，身体挺直。
3. 吸气，下蹲至四分之一深度，双臂向后摆。
4. 脚跟发力伸展双腿，双臂向前摆动，向侧上方跳起。呼气。
5. 落在台面上，吸气的同时小心从另一侧下台。
6. 向相反方向侧向跳。
7. 持续交替进行。
$zh$
 where slug = 'lateral-box-jump';

update exercise_template
   set title_zh = $zh$侧向抬腿$zh$,
       how_to_zh = $zh$1. 站直，双脚并拢，双腿伸直，肩部后收。
2. 扶住物体保持平衡，例如深蹲架或椅子。
3. 收紧腹部，吸气。
4. 一次流畅地将右腿向侧上方抬至最高，呼气。
5. 将腿放回起始位置，吸气。
6. 完成后，换另一条腿完成相同次数。
$zh$
 where slug = 'lateral-leg-raises';

update exercise_template
   set title_zh = $zh$侧向弓步$zh$,
       how_to_zh = $zh$1. 站直，双脚分开数厘米，脚尖略微外展。
2. 肩部后收，收紧腹部，双手置于胸前。
3. 吸气，左腿向侧方跨出，脚掌平贴地面。
4. 立即屈膝下蹲成弓步。保持另一条腿伸直，脚不离地。
5. 下蹲至左大腿几乎与地面平行，稍作停顿。
6. 左脚跟发力伸直膝盖，呼气的同时将腿收回起始位置。
7. 再次吸气，右腿向侧方跨出，完成相同动作。
8. 持续交替进行。
$zh$
 where slug = 'lateral-lunge';

update exercise_template
   set title_zh = $zh$弹力带侧平举$zh$,
       how_to_zh = $zh$1. 取一条两端带把手的开口弹力带。
2. 双脚踩住弹力带中段，双手握住把手置于体侧。
3. 肩部后收，收紧腹部，躯干略微前倾。双手应位于髋部前方。
4. 一次流畅地将双臂向两侧抬起。抬至肩、肘、腕成一条直线，顶端呼气。
5. 将双臂下放回起始位置，同时吸气。
$zh$
 where slug = 'lateral-raise-band';

update exercise_template
   set title_zh = $zh$绳索侧平举$zh$,
       how_to_zh = $zh$1. 将双绳索器械的滑轮调到最低位置并装上把手。
2. 在两侧配重片上选择合适的重量。
3. 向左走，用右手握住把手。
4. 向右走，用左手握住另一侧把手。
5. 站在中间，手臂伸直，双手位于髋部前方。
6. 收紧腹部，收紧肩胛骨，吸气。
7. 一次流畅地将双臂向两侧抬起，抬至肩、肘、腕成一条直线。顶端呼气。
8. 下放双臂，同时吸气。
$zh$
 where slug = 'lateral-raise-cable';

update exercise_template
   set title_zh = $zh$哑铃侧平举$zh$,
       how_to_zh = $zh$1. 双手各持一只轻哑铃，站直。
2. 肩部后收，收紧腹部，吸气。
3. 将双臂向两侧抬起，直至手肘与手腕和肩部齐平。顶端呼气。
4. 将哑铃下放至体侧，同时吸气。
$zh$
 where slug = 'lateral-raise-dumbbell';

update exercise_template
   set title_zh = $zh$固定器械侧平举$zh$,
       how_to_zh = $zh$1. 选择合适的配重并调整座椅高度。
2. 坐下，肩部后收并贴住靠背。
3. 握住身体两侧的把手，前臂平贴在垫板上。
4. 吸气，平稳地将双臂向两侧抬起，抬至手肘与肩同高。呼气。
5. 将双臂下放至体侧，吸气。
$zh$
 where slug = 'lateral-raise-machine';

update exercise_template
   set title_zh = $zh$侧向深蹲$zh$,
       how_to_zh = $zh$1. 双脚与髋同宽站立，脚尖略微外展。
2. 双臂在身前抬起以保持平衡。
3. 吸气，左腿向侧方跨出数厘米，踩实脚掌并下蹲。
4. 在力量与柔韧性允许的范围内尽量下蹲。
5. 稍作停顿，用力蹬脚跟起身还原，同时呼气。
6. 吸气，右腿向侧方跨出，踩实脚掌并下蹲。
7. 持续交替进行。
$zh$
 where slug = 'lateral-squat';

update exercise_template
   set title_zh = $zh$固定器械腿屈伸$zh$,
       how_to_zh = $zh$1. 选择合适的配重。
2. 调整垫板位置，使其在坐姿下贴住小腿、位于脚踝上方。
3. 坐下，握住身体两侧的把手，将小腿下段贴住垫板，收紧肩部。
4. 吸气，收紧股四头肌伸直双腿。
5. 将重量抬起直至膝盖伸直，呼气。
6. 稍作停顿，吸气并缓慢屈膝。
$zh$
 where slug = 'leg-extension-machine';

update exercise_template
   set title_zh = $zh$固定器械水平腿举$zh$,
       how_to_zh = $zh$1. 选择合适的配重并坐下。
2. 双脚以舒适间距平放在踏板上。
3. 肩部后收，收紧腹部，握住身体两侧的把手。
4. 吸气，将踏板向前推至双腿伸直。呼气。
5. 吸气并缓慢屈腿。
$zh$
 where slug = 'leg-press-horizontal-machine';

update exercise_template
   set title_zh = $zh$固定器械腿举$zh$,
       how_to_zh = $zh$1. 在腿举器械上加上适量配重并坐下。
2. 抬起双腿，将双脚平放在踏板上。双脚以舒适位置放置，脚尖略微外展。
3. 握住身体两侧的把手，肩部后收，收紧腹部。
4. 推动踏板并伸直双腿，同时转动手柄解除安全插销。
5. 再次吸气，屈膝下放踏板。
6. 在最低点稍作停顿，呼气的同时将踏板推开。
7. 完成后，伸直双腿，转动手柄扣上安全插销，然后休息。
$zh$
 where slug = 'leg-press-machine';

-- 0017 fragment 07 — leg-raise-parallel-bars .. plate-press
update exercise_template
   set title_zh = $zh$双杠举腿$zh$,
       how_to_zh = $zh$1. 坐在船长椅上，前臂平放在横向靠垫上，双手握住把手支撑身体。
2. 双脚并拢，收紧腹部，让下背贴住靠背。
3. 吸气，用流畅的动作抬高双腿，尽量抬高。在最高点呼气。
4. 缓慢将双腿放回起始位置，保持腹部紧张。下放时吸气，不要让下背拱起。$zh$
 where slug = 'leg-raise-parallel-bars';

update exercise_template
   set title_zh = $zh$低位绳索交叉飞鸟$zh$,
       how_to_zh = $zh$1. 选择合适的重量。
2. 将滑轮调到最低位置并装上把手。
3. 依次握住两个把手，站在中间，双臂垂于身体两侧。
4. 前后错开站立，肩部后收，收紧腹部。
5. 吸气，双臂向上向内合拢，在挤压胸肌并呼气时让把手轻碰。
6. 吸气，缓慢将双臂放回身体两侧。
$zh$
 where slug = 'low-cable-fly-crossovers';

update exercise_template
   set title_zh = $zh$悬吊带低位划船$zh$,
       how_to_zh = $zh$1. 握住悬吊带的把手，双臂在身体前方伸直。
2. 向前迈一小步，让身体后倾到舒适的角度。
3. 肩部后收，收紧腹部，夹紧臀部。
4. 吸气，将身体拉起，在最高点挤压背部肌肉并呼气。
5. 缓慢伸直手臂并吸气。
$zh$
 where slug = 'low-row-suspension';

update exercise_template
   set title_zh = $zh$弓步$zh$,
       how_to_zh = $zh$1. 站直，肩部后收，双手叉腰，目视前方。
2. 吸气并收紧腹部。
3. 向前弓步，右腿迈到身体前方，脚掌踩实地面。
4. 立即屈膝下蹲，直到后侧膝盖轻触地面。
5. 通过前脚脚跟发力站起并呼气。
6. 后脚向前迈出，踩实地面，再次弓步。
$zh$
 where slug = 'lunge';

update exercise_template
   set title_zh = $zh$杠铃弓步$zh$,
       how_to_zh = $zh$1. 将杠铃置于上背，双手握住以稳定。
2. 双脚与髋同宽，脚尖略微外展。
3. 吸气，向前弓步，脚掌平放踩实地面。
4. 立即下蹲成弓步，保持躯干稳定直立。
5. 下蹲至后侧膝盖距离地面一两英寸。
6. 通过前脚脚跟发力伸直膝盖，呼气的同时将腿带回起始位置。
7. 再次吸气，向前弓步，换另一条腿。
8. 交替进行。
$zh$
 where slug = 'lunge-barbell';

update exercise_template
   set title_zh = $zh$哑铃弓步$zh$,
       how_to_zh = $zh$1. 双手各持一只哑铃，置于身体两侧，站直。
2. 肩部后收，收紧腹部，双脚以舒适的姿势站立。
3. 吸气，向前弓步，一只脚踩到身体前方。
4. 立即下蹲成弓步，下蹲至前侧大腿几乎与地面平行。后侧膝盖应距离地面一两英寸。
5. 通过前脚脚跟发力伸直腿，呼气的同时回到起始位置。
6. 再次吸气，向前弓步，换另一条腿。
7. 交替进行。
$zh$
 where slug = 'lunge-dumbbell';

update exercise_template
   set title_zh = $zh$仰卧屈膝举腿$zh$,
       how_to_zh = $zh$1. 仰卧在地面，双脚并拢，双臂置于身体两侧，身体成一条直线。
2. 收紧腹部，将双脚抬起距离地面一两英寸。下背应贴住地面。
3. 吸气，抬起双腿，膝盖弯曲成 90 度角。呼气。
4. 缓慢将双腿放回起始位置，同时伸直膝盖。吸气，并保持双脚离开地面。
$zh$
 where slug = 'lying-knee-raise';

update exercise_template
   set title_zh = $zh$俯卧固定器械腿弯举$zh$,
       how_to_zh = $zh$1. 选择合适的重量，并调整靠垫，使你躺下时靠垫位于跟腱（脚跟上方）处。
2. 躺下，握住把手，将小腿后侧抵住靠垫。
3. 吸气，收紧腘绳肌弯举双腿，抬起重量。
4. 弯举至小腿几乎垂直，在最高点呼气。
5. 停顿片刻，吸气的同时缓慢伸直膝盖。
$zh$
 where slug = 'lying-leg-curl-machine';

update exercise_template
   set title_zh = $zh$仰卧举腿$zh$,
       how_to_zh = $zh$1. 仰卧在地面，双腿伸直，双臂置于身体两侧，手掌平放地面。
2. 收紧腹部，吸气，双脚并拢。
3. 抬起双腿，直到脚跟朝向天花板。呼气。
4. 缓慢放下双腿，不要让双脚放在地面上，并吸气。每次重复时保持下背略微拱起。
$zh$
 where slug = 'lying-leg-raise';

update exercise_template
   set title_zh = $zh$仰卧颈部弯举$zh$,
       how_to_zh = $zh$1. 仰卧在平板健身凳上，头部悬在凳子边缘外。
2. 吸气，将头部下放至舒适的位置。
3. 呼气的同时收缩颈前肌肉完成一次动作。
4. 吸气，再次下放头部。
$zh$
 where slug = 'lying-neck-curls';

update exercise_template
   set title_zh = $zh$负重仰卧颈部弯举$zh$,
       how_to_zh = $zh$1. 取一片杠铃片，仰卧在平板健身凳上，头部悬在凳子边缘外。
2. 将杠铃片抵住前额，双手握住。
3. 吸气，将头部下放至舒适的位置。
4. 呼气的同时收缩颈前肌肉抬起头部。
$zh$
 where slug = 'lying-neck-curls-weighted';

update exercise_template
   set title_zh = $zh$俯卧颈部伸展$zh$,
       how_to_zh = $zh$1. 俯卧在平板健身凳上，头部悬在凳子边缘外。
2. 握住靠背保持平衡，或将双手放在地面上。
3. 吸气，用流畅的动作向后伸展颈部。呼气。
4. 吸气的同时下放头部，重复。
$zh$
 where slug = 'lying-neck-extension';

update exercise_template
   set title_zh = $zh$负重俯卧颈部伸展$zh$,
       how_to_zh = $zh$1. 取一片杠铃片，俯卧在平板健身凳上，头部悬在凳子边缘外。
2. 将杠铃片置于头后，双手握住。
3. 吸气，下放头部直到感觉颈后拉伸。
4. 用流畅的动作伸展颈部抬起头部并呼气。
$zh$
 where slug = 'lying-neck-extension-weighted';

update exercise_template
   set title_zh = $zh$杠铃梅多斯划船$zh$,
       how_to_zh = $zh$1. 将杠铃装入地雷架，或将杠铃一端抵在墙角作为固定点。
2. 在杠铃另一端加上重量。
3. 站在杠铃负重一侧的垂直方向（身体一侧朝向杠铃）。
4. 采用前后错开的站姿，俯身，用靠近杠铃的手握住杠铃套筒。
5. 抬起躯干，直到手臂伸直时杠铃负重端离开地面一两英寸。
6. 肩部后收，吸气，将杠铃向上拉起贴近身体一侧，挤压背阔肌。呼气的同时将重量拉到肘部呈 90 度角、杠铃套筒位于躯干高度。
7. 缓慢伸直手臂，下放时吸气。每次动作到底部时不要让肩部前引（向前滚动）。
8. 一侧训练完成后，身体转 180 度，用另一只手臂完成相同次数。
$zh$
 where slug = 'meadows-rows-barbell';

update exercise_template
   set title_zh = $zh$登山跑$zh$,
       how_to_zh = $zh$1. 跪撑在地面，双手和双膝平放在地上。
2. 伸直双腿，用脚尖支撑下半身。
3. 收紧腹部，将臀部向天花板抬起几英寸。
4. 吸气，用流畅的动作将右膝收向胸部。呼气。
5. 吸气的同时伸直右腿。
6. 将左膝收向胸部并呼气。
7. 交替进行，全程保持稳定的节奏。
$zh$
 where slug = 'mountain-climber';

update exercise_template
   set title_zh = $zh$双力臂$zh$,
       how_to_zh = $zh$1. 站在引体向上杠下方，向上伸展、起跳，用双手正握（掌心朝前）握住单杠。
2. 握住单杠时收紧腹部，肩胛骨后收，髋部略微屈曲，双腿伸直，双脚并拢。
3. 当身体开始向后摆动时，尽可能有力地向上拉起，目标是让身体绕到单杠上方。惯性应能让你升得足够高，使胸部略高于单杠。
4. 做直杠臂屈伸伸直肘部，在接近顶部时呼气。
5. 屈肘，让身体从单杠上缓缓下降。
6. 前后摆动产生惯性，在身体开始向后摆动的瞬间开始下一次重复。
$zh$
 where slug = 'muscle-up';

update exercise_template
   set title_zh = $zh$离心引体向上$zh$,
       how_to_zh = $zh$1. 在引体向上杠下方放置凳子、健身凳或跳箱。
2. 踩上物体，用正握（掌心朝前）握住引体向上杠。肘部应弯曲约 90 度。
3. 深吸气并收紧腹部。
4. 从物体上踏下，让身体悬空，对抗重力缓慢伸直手臂。
5. 完成后再次踩上稳固的物体，重复。
$zh$
 where slug = 'negative-pull-up';

update exercise_template
   set title_zh = $zh$北欧腘绳肌弯举$zh$,
       how_to_zh = $zh$1. 跪在地上，将双脚固定在负重杠铃或其他稳固物体下方。
2. 肩部后收，收紧腹部，夹紧臀部。
3. 双臂可置于身体两侧，或双手放在躯干前方支撑。
4. 吸气，通过缓慢伸直膝盖将躯干下放至地面。保持髋部稳定，臀部收紧。
5. 在力量允许的范围内尽量下放，然后收紧身体后侧肌群将躯干抬回直立位置。在接近顶部时呼气。
$zh$
 where slug = 'nordic-hamstrings-curls';

update exercise_template
   set title_zh = $zh$腹斜肌卷腹$zh$,
       how_to_zh = $zh$1. 侧卧在右侧，屈膝，双腿叠放。
2. 左手放在头后。
3. 吸气，收缩上侧腹斜肌卷起躯干，将右肩抬离地面。呼气。
4. 吸气，将肩膀放回地面。
5. 重复。
6. 完成后换左侧侧卧，完成相同次数。
$zh$
 where slug = 'oblique-crunch';

update exercise_template
   set title_zh = $zh$单臂俯卧撑$zh$,
       how_to_zh = $zh$1. 跪撑在地面。
2. 伸直双腿，用脚尖支撑下半身。双脚间距宽于髋宽。
3. 双手与肩同宽或略宽。
4. 收紧腹部。
5. 身体绷紧并保持姿势，将一只手抬离地面，放到背后。
6. 吸气，屈曲支撑臂将身体下放。尽量下放，理想情况下直到胸部距离地面几英寸。
7. 伸直手臂回到起始位置并呼气。
8. 一侧完成后，换另一只手支撑身体，完成相同次数。
$zh$
 where slug = 'one-arm-push-up';

update exercise_template
   set title_zh = $zh$绳索过头弯举$zh$,
       how_to_zh = $zh$1. 将双滑轮绳索机的滑轮调到最高位置。
2. 在两个配重片组上选择合适的重量，并将把手装到滑轮上。
3. 握住两个把手，站在绳索机中间，双臂伸直置于身体两侧。
4. 肩部后收，收紧腹部。
5. 呼气的同时屈肘，将把手拉向头部两侧。
6. 吸气的同时缓慢伸直手臂。
$zh$
 where slug = 'overhead-curl-cable';

update exercise_template
   set title_zh = $zh$哑铃过头弓步$zh$,
       how_to_zh = $zh$1. 双手各持一只哑铃，站直。
2. 将重量举过头顶，手臂伸直。
3. 肩部后收，收紧腹部，吸气。
4. 右腿向前迈出，脚掌踩实地面。
5. 下蹲成弓步，直到前侧大腿几乎与地面平行。
6. 通过前脚脚跟发力伸直膝盖，呼气的同时将腿带回起始位置。
7. 再次吸气，换另一条腿向前迈出。
8. 左右交替，直到完成。
$zh$
 where slug = 'overhead-dumbbell-lunge';

update exercise_template
   set title_zh = $zh$杠铃片过头举$zh$,
       how_to_zh = $zh$1. 将中指和无名指伸入杠铃片中心孔并扣住杠铃片，拇指、食指和小指紧压在另一面。
2. 用另一只手以同样的方式握住第二片杠铃片。
3. 站直，手臂伸直，杠铃片置于身体两侧，手腕保持中立（掌心朝向身体）。
4. 挺胸，收紧腹部，吸气。
5. 以平滑的弧线将杠铃片举至身体两侧并过头顶，在最高点让双手指关节相对。呼气。
6. 沿同样的弧线缓慢将杠铃片放回身体两侧，下放时吸气。
7. 重复。
$zh$
 where slug = 'overhead-plate-raise';

update exercise_template
   set title_zh = $zh$杠铃过头推举$zh$,
       how_to_zh = $zh$1. 将杠铃放在架子上锁骨高度的位置。
2. 用正握（掌心朝下）握住杠铃，双手约与肩同宽。
3. 身体钻到杠铃下方，肩部后收，收紧腹部，吸气。
4. 取下杠铃，向后退几步。
5. 双脚与髋同宽，杠铃位于上胸高度。
6. 再次吸气，将杠铃沿垂直直线向上推，头部略微后移。
7. 推至手臂伸直并呼气。
8. 沿同样的直线下放杠铃，直到其位于颈部高度。下放时吸气。
9. 完成后向前走，小心地将杠铃放回架上。
$zh$
 where slug = 'overhead-press-barbell';

update exercise_template
   set title_zh = $zh$哑铃过头推举$zh$,
       how_to_zh = $zh$1. 双手各持一只哑铃，站直。
2. 肩部后收，收紧腹部，夹紧臀部。
3. 吸气，将哑铃举到身体两侧。肘部弯曲 90 度。
4. 再次吸气，将重量向上向内推起，在最高点轻碰。呼气。
5. 将哑铃下放至身体两侧并吸气。
6. 当肘部略低于肩部时停止，开始下一次重复。
$zh$
 where slug = 'overhead-press-dumbbell';

update exercise_template
   set title_zh = $zh$史密斯机过头推举$zh$,
       how_to_zh = $zh$1. 将史密斯机杠铃调至锁骨高度并加上杠铃片。
2. 站在杠铃前，用均匀的正握握住杠铃。双手应与肩同宽。
3. 肩部后收，收紧腹部，吸气。
4. 取下杠铃。
5. 再次吸气，将杠铃向上推过头顶，在最高点呼气。
6. 缓慢下放杠铃，下放时吸气。
$zh$
 where slug = 'overhead-press-smith-machine';

update exercise_template
   set title_zh = $zh$过头深蹲$zh$,
       how_to_zh = $zh$1. 用双手正握握住杠铃。握距可宽一些，但不要宽到肩部不适。
2. 将杠铃举过头顶，手臂伸直。
3. 肩部后收，收紧腹部，双脚以舒适的深蹲站姿站立。
4. 吸气并下蹲。
5. 保持脚跟贴地，下蹲直到大腿与地面平行。
6. 停顿片刻，通过脚跟发力蹬起。
7. 完全伸直膝盖和髋部，在接近顶部时呼气，并保持杠铃位于头顶正上方。
$zh$
 where slug = 'overhead-squat';

update exercise_template
   set title_zh = $zh$绳索过头肱三头肌屈伸$zh$,
       how_to_zh = $zh$1. 将滑轮调至大腿中部高度，装上绳索，并选择合适的重量。
2. 用正握（掌心朝向身体）握住绳索两端。
3. 用一个动作转身背对器械，略微下蹲将绳索举过肩部，置于头后。肘部应弯曲并位于头部两侧。
4. 挺胸，身体略微前倾，一只脚向前保持平衡，收紧腹部。
5. 吸气，伸直肘部，在最高点分开绳索。呼气。
6. 吸气的同时缓慢屈肘。
$zh$
 where slug = 'overhead-triceps-extension-cable';

update exercise_template
   set title_zh = $zh$杠铃半程臀桥$zh$,
       how_to_zh = $zh$1. 坐下，将负重杠铃放在髋部上方，上背靠在平板健身凳边缘。
2. 双手均匀握住杠铃以稳定，双脚平放地面，脚尖略微外展。
3. 收紧腹部，吸气，用髋部顶住杠铃。
4. 通过脚跟发力，收紧臀部，将杠铃和髋部向天花板抬起。
5. 当髋部与上身成一直线时停顿。在最高点夹紧臀部并呼气。
6. 吸气的同时缓慢将臀部下放几英寸。保持腹部紧张，当膝盖开始向髋部回移时停止。
7. 再次伸展髋部并呼气。
8. 在这个半程活动范围内完成所需次数，然后将臀部放回地面。
$zh$
 where slug = 'partial-glute-bridge-barbell';

update exercise_template
   set title_zh = $zh$杠铃停顿深蹲$zh$,
       how_to_zh = $zh$1. 将杠铃调至锁骨高度并加上合适的重量。
2. 双手均匀地握住杠铃。
3. 头部钻到杠铃下方，将斜方肌贴在杠铃上。
4. 绷紧全身，伸直膝盖取下杠铃。
5. 小心地向后退几步，采用舒适的深蹲站姿，深吸气并收紧腹部。
6. 下蹲至舒适的深度，停顿两到三秒。
7. 通过脚跟发力回到顶部并呼气。
$zh$
 where slug = 'pause-squat-barbell';

update exercise_template
   set title_zh = $zh$杠铃潘德利划船$zh$,
       how_to_zh = $zh$1. 站在杠铃前，双脚以舒适的姿势站立，脚尖略微外展。
2. 俯身，用双手正握握住杠铃。
3. 肩部后收以挺直背部。肩部应略在杠铃前方并高于髋部。
4. 吸气，将杠铃划向胸部并呼气。
5. 缓慢下放杠铃，吸气的同时将其放回地面。
6. 从静止状态再次将杠铃划起。
$zh$
 where slug = 'pendlay-row-barbell';

update exercise_template
   set title_zh = $zh$固定器械钟摆深蹲$zh$,
       how_to_zh = $zh$1. 装上合适数量的杠铃片。
2. 进入器械内，双脚踩在踏板上，上背贴住靠垫。
3. 双脚以舒适的深蹲站姿站立，脚尖略微外展。
4. 握住头部两侧（或前方）的把手。
5. 肩胛骨后收，收紧腹部，深吸气。
6. 完全伸直膝盖抬起重量，利用把手将其取下。
7. 缓慢下蹲，直到膝盖呈 90 度角，并短暂停顿。
8. 通过脚跟发力回到顶部位置并呼气。
$zh$
 where slug = 'pendulum-squat-machine';

update exercise_template
   set title_zh = $zh$屈体俯卧撑$zh$,
       how_to_zh = $zh$1. 跪撑在地面，双膝和双手放在地上。
2. 伸直双腿，用脚尖支撑下半身。
3. 将臀部向后上方抬起，使身体折叠成起始姿势。
4. 保持肩部后收以维持脊柱中立。
5. 吸气，屈肘将身体下放至地面。
6. 下放至前额接近地面，呼气的同时撑回顶部。
$zh$
 where slug = 'pike-pushup';

update exercise_template
   set title_zh = $zh$普拉提$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）$zh$
 where slug = 'pilates';

update exercise_template
   set title_zh = $zh$哑铃风车弯举$zh$,
       how_to_zh = $zh$1. 双手各持一只哑铃，站直，肩部后收，挺胸。
2. 将两只哑铃置于大腿稍前方，掌心朝向内侧和后方。
3. 吸气，将一只哑铃向胸部弯举，直到略高于肘部。呼气。
4. 将哑铃放回起始位置，手臂完全伸直。下放时吸气。
5. 换另一只手臂重复。
6. 交替进行。
$zh$
 where slug = 'pinwheel-curl-dumbbell';

update exercise_template
   set title_zh = $zh$手枪深蹲$zh$,
       how_to_zh = $zh$1. 站直，双臂前伸，双脚平放地面，肩部后收，收紧腹部。
2. 将左脚抬起离开地面几英寸，吸气。
3. 屈右膝下蹲，让左腿在身体前方伸出。
4. 尽量下蹲，理想情况下直到大腿与地面平行。
5. 通过右脚脚跟发力回到顶部并呼气。
6. 一侧完成后，将左脚踩实地面，完成相同次数。
$zh$
 where slug = 'pistol-squat';

update exercise_template
   set title_zh = $zh$平板支撑俯卧撑$zh$,
       how_to_zh = $zh$1. 跪撑在地面。
2. 伸直双腿，用脚尖支撑下半身。
3. 前臂平放地面，肘部位于肩部正下方。
4. 收紧腹部，吸气。
5. 依次伸直手臂，将手掌平放地面撑起身体，双臂伸直时呼气。
6. 反向动作，吸气的同时将前臂放回地面。
7. 在两种姿势之间交替进行。
$zh$
 where slug = 'plank-pushup';

update exercise_template
   set title_zh = $zh$杠铃片弯举$zh$,
       how_to_zh = $zh$1. 握住杠铃片两侧，将其置于髋部前方。
2. 肩部后收，收紧腹部。
3. 吸气，弯举杠铃片直到手腕略高于肘部。在最高点呼气。
4. 吸气的同时缓慢伸直手臂。
$zh$
 where slug = 'plate-curl';

update exercise_template
   set title_zh = $zh$杠铃片前平举$zh$,
       how_to_zh = $zh$1. 握住一片杠铃片的两侧，手臂伸直。
2. 肩部后收，双脚以舒适的姿势站立，目视前方，吸气。
3. 收紧腹部，保持手臂伸直将杠铃片举到身体前方。呼气。
4. 吸气的同时缓慢将杠铃片下放至髋部。
$zh$
 where slug = 'plate-front-raise';

update exercise_template
   set title_zh = $zh$杠铃片推举$zh$,
       how_to_zh = $zh$1. 握住杠铃片两侧，将其举到胸前。
2. 双脚以舒适的姿势站立，收紧腹部，肩胛骨后收。
3. 吸气，将杠铃片向前推出，完全伸直手臂并呼气。
4. 吸气的同时缓慢屈臂，将杠铃片收回胸前。
$zh$
 where slug = 'plate-press';

-- 0017 fragment 08 — plate-squeeze-svend-press .. romanian-deadlift-barbell
update exercise_template
   set title_zh = $zh$杠铃片挤压（斯文德推举）$zh$,
       how_to_zh = $zh$1. 抓起一片杠铃片，站直身体。
2. 双手将杠铃片夹紧于胸前并抬起。
3. 肩部后收，收紧腹部，双脚站于舒适位置。
4. 吸气，将杠铃片向前推出，直至手臂伸直。呼气。
5. 吸气的同时将杠铃片缓慢收回胸前。
$zh$
 where slug = 'plate-squeeze-svend-press';

update exercise_template
   set title_zh = $zh$高翻$zh$,
       how_to_zh = $zh$1. 站于装有杠铃片的杠铃前，双脚位于杠铃下方，小腿距杠铃约几厘米。
2. 俯身，双手以均匀的正握握住杠铃。
3. 尽量挺起胸部。此时臀部应略高于膝盖。
4. 脚跟压向地面，将杠铃硬拉离地，启动第一次发力。起始拉起要有力。
5. 当杠铃超过膝盖后，持续向前送髋，同时沿垂直直线拉起重量。整个动作应连贯流畅。
6. 杠铃上升时下蹲，接住杠铃，使其落于肩部与上胸之上。
7. 杠铃落于前架位后，蹲起至站立，完全伸直膝盖。在最高点呼气。
8. 保持背部中立，将杠铃放回地面。
$zh$
 where slug = 'power-clean';

update exercise_template
   set title_zh = $zh$高抓$zh$,
       how_to_zh = $zh$1. 站于装有杠铃片的杠铃前。
2. 双脚位于杠铃下方，小腿距杠铃约几厘米。
3. 俯身，双手以双正握握住杠铃。采用宽握，但不要宽到肩部不适。
4. 下压臀部，使小腿贴住杠铃，挺起胸部以挺直背部。
5. 吸气并收紧腹部。
6. 沿直线拉起杠铃，使其贴近小腿。
7. 杠铃一旦超过膝盖，立即启动第二次更有力的上拉，同时伸展髋部。
8. 杠铃沿垂直直线上升时，用上身继续将其拉至胸部高度。
9. 杠铃足够高时立即屈膝，身体钻到杠铃下方，以手臂伸直过头姿势接住。
10. 伸腿站起并在呼气中完成这次动作。
11. 保持杠铃贴近身体，将其缓慢放回地面。
$zh$
 where slug = 'power-snatch';

update exercise_template
   set title_zh = $zh$杠铃牧师凳弯举$zh$,
       how_to_zh = $zh$1. 装好杠铃并调整牧师凳座椅高度。应能将上臂放在垫板上并保持躯干直立。
2. 站到器械前，双手以均匀的反握握住杠铃（掌心朝向天花板），抬起杠铃后坐下。
3. 肩部后收，收紧腹部，吸气。
4. 放下杠铃，直至手臂几乎伸直。
5. 抬起杠铃，直至前臂几乎竖直，呼气。
6. 吸气的同时缓慢伸直手臂。
$zh$
 where slug = 'preacher-curl-barbell';

update exercise_template
   set title_zh = $zh$哑铃牧师凳弯举$zh$,
       how_to_zh = $zh$1. 调整牧师凳座椅高度。应能舒适地将上臂后侧贴住垫板。
2. 拿起一对哑铃并坐下。
3. 将手臂放在垫板上，屈肘，手腕朝向身体。
4. 收紧腹部并吸气。
5. 放下哑铃，直至手臂伸直。
6. 将哑铃弯举至最高位置，前臂几乎竖直时停止。呼气。
$zh$
 where slug = 'preacher-curl-dumbbell';

update exercise_template
   set title_zh = $zh$固定器械牧师凳弯举$zh$,
       how_to_zh = $zh$1. 选择合适的配重。
2. 调整座椅高度。坐姿时应能将肱三头肌贴住垫板。
3. 坐下，伸直手臂并握住把手。
4. 收紧腹部并吸气。
5. 屈臂抬起重量，直至前臂几乎竖直。在最高点呼气。
6. 吸气的同时缓慢伸直手臂。
$zh$
 where slug = 'preacher-curl-machine';

update exercise_template
   set title_zh = $zh$下蹲推举$zh$,
       how_to_zh = $zh$1. 双手以双正握握住杠铃。采用宽握，但不要宽到肩部不适。
2. 抬起杠铃，置于颈后的上背部。
3. 双脚站于舒适位置，肩部后收，收紧腹部。
4. 吸气，在下蹲的同时将杠铃推举过头。
5. 下蹲直至大腿与地面平行。
6. 脚跟发力伸直双腿，将杠铃放回上背部时呼气。
7. 吸气并重复。
$zh$
 where slug = 'press-under';

update exercise_template
   set title_zh = $zh$辅助引体向上$zh$,
       how_to_zh = $zh$1. 在引体向上器械上选择合适的配重。
2. 以正握握住引体向上杆（掌心朝前）。
3. 双膝跪在软垫平台上。
4. 肩部后收，收紧腹部，吸气。
5. 将自己拉起，直至下巴略高于横杆，呼气。
6. 吸气的同时缓慢下降并完全伸直手臂。
$zh$
 where slug = 'pull-up-assisted';

update exercise_template
   set title_zh = $zh$弹力带引体向上$zh$,
       how_to_zh = $zh$1. 将环形弹力带套在引体向上杆上，使其自然下垂。
2. 以正握握住引体向上杆，双脚依次踩入弹力带环中。双手间距应略宽于肩。
3. 身体悬空后，肩部后收并吸气。
4. 将自己拉起，呼气的同时使下巴超过横杆。
5. 在最高点稍作停顿，然后缓慢下降并完全伸直手臂。下降时吸气。
$zh$
 where slug = 'pull-up-band';

update exercise_template
   set title_zh = $zh$负重引体向上$zh$,
       how_to_zh = $zh$1. 用负重腰带将杠铃片挂在身上。
2. 向上伸臂，以均匀的正握握住引体向上杆。
3. 肩部后收，收紧腹部，吸气。
4. 以连贯动作将自己拉起，在最高点呼气。
5. 缓慢下降并吸气，双脚始终保持离地。
$zh$
 where slug = 'pull-up-weighted';

update exercise_template
   set title_zh = $zh$哑铃直臂上拉$zh$,
       how_to_zh = $zh$1. 选一只哑铃，放在健身凳旁的地面上。
2. 上背部靠在平板健身凳上。
3. 屈膝，双脚平放于地面。
4. 向下伸手抓起哑铃。
5. 双手平贴在哑铃上层铃片上，将重量置于躯干上方。
6. 肩部后收，收紧腹部，吸气。
7. 保持手臂伸直，将哑铃下放至头后。
8. 稍作停顿，呼气的同时将哑铃拉回起始位置。
$zh$
 where slug = 'pullover-dumbbell';

update exercise_template
   set title_zh = $zh$固定器械直臂上拉$zh$,
       how_to_zh = $zh$1. 为器械加上合适的配重并调整座椅高度。
2. 坐下，将肱三头肌下部和肘部放在垫板上，双手握住把手以提供额外支撑。
3. 吸气，收紧腹部，将重量下拉，直至肘部到达身体两侧。呼气。
4. 吸气的同时将手臂举回头顶起始位置。
$zh$
 where slug = 'pullover-machine';

update exercise_template
   set title_zh = $zh$借力推举$zh$,
       how_to_zh = $zh$1. 使杠铃处于前架位：双手间距略宽于肩，完整握住置于肩上的杠铃。
2. 双脚约与髋同宽，脚尖略微外展。
3. 深吸气，保持躯干直立，屈膝屈髋开始下蹲蓄力阶段。
4. 下蹲几厘米后改变方向，脚跟发力伸展膝、髋。
5. 借助下肢的动量经躯干传导，将杠铃推离肩部。
6. 随即用肘部发力将杠铃推举过头，在最高点呼气。
7. 吸气的同时将杠铃缓慢放回起始位置，落于肩上。
$zh$
 where slug = 'push-press';

update exercise_template
   set title_zh = $zh$窄握俯卧撑$zh$,
       how_to_zh = $zh$1. 双手与双膝撑地。
2. 双手靠近。
3. 将身体撑成俯卧撑姿势。肩、髋、膝、踝应处于一条直线。
4. 肩部后收并吸气。
5. 屈肘下降。尽可能下放身体。
6. 在最低点稍作停顿，呼气的同时推起身体回到最高点。
$zh$
 where slug = 'push-up-close-grip';

update exercise_template
   set title_zh = $zh$负重俯卧撑$zh$,
       how_to_zh = $zh$1. 双膝双手撑地。
2. 伸直双腿，双脚与髋同宽。
3. 双手间距略宽于肩，肘部内收。
4. 收紧腹部，保持脊柱中立。
5. 让他人将一片杠铃片放在你的中背部。
6. 吸气并屈肘下降身体。
7. 在力量允许范围内尽量下降，最好直至躯干距地面几厘米。
8. 呼气的同时伸直肘部将身体推回最高点。
9. 再次吸气并重复。
$zh$
 where slug = 'push-up-weighted';

update exercise_template
   set title_zh = $zh$架上硬拉$zh$,
       how_to_zh = $zh$1. 将杠铃架设在小腿中部高度。
2. 站于杠铃前，小腿距杠铃一两英寸。
3. 俯身，双手以略宽于大腿的间距握住杠铃。
4. 小腿贴住杠铃，同时让膝盖略微顶住肘部。
5. 挺起胸部并拱起上背。
6. 收紧上背，伸展髋部，将杠铃贴着小腿和大腿上拉。在最高点呼气。
7. 臀部后移开始下放，沿同一直线放下杠铃。下降过程中或下一次动作前吸气。
$zh$
 where slug = 'rack-pull';

update exercise_template
   set title_zh = $zh$绳索三角肌后束反向飞鸟$zh$,
       how_to_zh = $zh$1. 将双滑轮绳索器械的滑轮调至最高位置并装上把手。
2. 选择合适的配重，站在器械中间。
3. 左肩朝向滑轮，右手握住把手。
4. 走到右侧滑轮处，左手握住把手。
5. 站在器械中间，收紧腹部，双臂向前伸直。
6. 吸气，向两侧打开手臂，挤压上背肌肉。呼气。
7. 吸气的同时将手臂缓慢收回起始位置。
$zh$
 where slug = 'rear-delt-reverse-fly-cable';

update exercise_template
   set title_zh = $zh$哑铃三角肌后束反向飞鸟$zh$,
       how_to_zh = $zh$1. 拿起一对轻哑铃，双脚与髋同宽。
2. 以髋为轴前倾躯干，保持脊柱中立。
3. 手臂伸直，手腕保持中立（彼此相对）。
4. 肩部后收并吸气。
5. 收紧三角肌后束，将两只哑铃向两侧举起。
6. 举至肘部与肩齐平并稍作停顿。呼气。
7. 将哑铃放回起始位置并吸气。
$zh$
 where slug = 'rear-delt-reverse-fly-dumbbell';

update exercise_template
   set title_zh = $zh$固定器械三角肌后束反向飞鸟$zh$,
       how_to_zh = $zh$1. 选择合适的配重。
2. 调整座椅高度。坐姿时把手应与肩齐平。
3. 坐下，以掌心向下的姿势握住把手。
4. 肩部后收并吸气。
5. 呼气的同时将手臂向两侧及后方伸展。
6. 吸气的同时将手臂收回起始位置。
$zh$
 where slug = 'rear-delt-reverse-fly-machine';

update exercise_template
   set title_zh = $zh$固定器械后踢$zh$,
       how_to_zh = $zh$1. 加上合适的配重，面朝胸垫和把手站入器械内。
2. 一侧小腿抵住下方垫板以保持稳定，另一条腿向后抬起，脚掌平贴踏板。
3. 前倾，使腹部和胸部贴住垫板。握住把手。
4. 吸气，收紧腹部，以连贯动作向后上方蹬踏板，直至膝盖完全伸直。呼气。
5. 吸气的同时缓慢屈膝。再次蹬出并呼气。
6. 一侧练完后，交换双腿位置，做相同次数的动作。
$zh$
 where slug = 'rear-kick-machine';

update exercise_template
   set title_zh = $zh$卧式健身车$zh$,
       how_to_zh = $zh$1. 拉动座椅下方的调节杆，将座椅调到合适位置。双腿应能伸展而不至于膝盖锁死。
2. 坐下，双脚踩在踏板上，选择阻力。
3. 握住座椅两侧的把手以保持支撑。
4. 以可持续的节奏开始骑行，并保持平稳呼吸。
$zh$
 where slug = 'recumbent-bike';

update exercise_template
   set title_zh = $zh$哑铃叛徒划船$zh$,
       how_to_zh = $zh$1. 将一对六角哑铃平行放置，间距以能握住它们做俯卧撑为宜。
2. 俯身握住两只哑铃。伸直双腿使身体成一条直线并挺胸。手臂与身体应保持笔直。
3. 双脚分开以保持更好的平衡。
4. 将重心略微移向左侧。
5. 吸气，将右侧哑铃划起，直至肘部与躯干齐平。在最高点呼气。
6. 将重量放回起始位置并吸气。
7. 略微向右侧倾斜，划起左侧哑铃。
8. 持续交替进行，直至完成。
$zh$
 where slug = 'renegade-row-dumbbell';

update exercise_template
   set title_zh = $zh$反向卷腹$zh$,
       how_to_zh = $zh$1. 仰卧于地面，双臂放于身体两侧，手掌平贴地面。
2. 屈膝成 90 度，使膝盖位于髋部正上方。
3. 吸气，收紧腹部，以连贯动作将膝盖收向上腹部，同时将臀部抬离地面。呼气。
4. 吸气的同时将膝盖缓慢放回起始位置。
$zh$
 where slug = 'reverse-crunch';

update exercise_template
   set title_zh = $zh$杠铃反握弯举$zh$,
       how_to_zh = $zh$1. 以正握握住杠铃（掌心朝向身体）。
2. 站直，双脚站于舒适位置，肩胛骨后收。
3. 收紧腹部并吸气。
4. 弯举杠铃，屈臂直至手腕略高于肘部。呼气。
5. 吸气的同时缓慢伸直手臂。
$zh$
 where slug = 'reverse-curl-barbell';

update exercise_template
   set title_zh = $zh$绳索反握弯举$zh$,
       how_to_zh = $zh$1. 选择合适的配重，将滑轮调至最低位置并装上直杆。
2. 俯身，以正握握住横杆（掌心向下），然后站直。
3. 后退一步，将配重块拉起离开配重片。
4. 肩胛骨后收并收紧腹部。
5. 以连贯动作弯举重量，直至手腕略高于肘部，呼气。保持肘部贴近身体两侧。
6. 吸气的同时缓慢伸直手臂。
$zh$
 where slug = 'reverse-curl-cable';

update exercise_template
   set title_zh = $zh$哑铃反握弯举$zh$,
       how_to_zh = $zh$1. 拿起一对哑铃并站直。
2. 双臂放于身体前方，哑铃贴住大腿上部。手腕应旋前（掌心朝向身体）。
3. 肩胛骨后收，收紧腹部，吸气。
4. 将哑铃弯举向上，直至手腕略高于肘部，呼气。
5. 吸气的同时缓慢伸直手臂。
$zh$
 where slug = 'reverse-curl-dumbbell';

update exercise_template
   set title_zh = $zh$绳索单臂反向飞鸟$zh$,
       how_to_zh = $zh$1. 将滑轮调至肩部高度并装上把手。
2. 选择合适的配重，右手握住把手，向右后方斜退一步，将配重拉离配重片。
3. 肩部后收，收紧腹部，吸气。
4. 将手臂向右后方伸展，挤压肩部肌肉并呼气。
5. 吸气的同时将手臂缓慢收回身体前方。
6. 重复。
7. 完成后，左手握住把手，向左走两步，做相同次数的动作。
$zh$
 where slug = 'reverse-fly-single-arm-cable';

update exercise_template
   set title_zh = $zh$反握集中弯举$zh$,
       how_to_zh = $zh$1. 拿起一只哑铃，坐在平板健身凳边缘。
2. 分开双腿，双脚平放于地面。
3. 右手握住哑铃并内旋手腕，使掌心朝向内侧。
4. 将右肘抵住大腿内侧。
5. 吸气并屈臂抬起哑铃。
6. 抬起至手腕略高于肘部，呼气。
7. 吸气的同时伸直手臂。
8. 完成后，换另一侧做相同次数的动作。
$zh$
 where slug = 'reverse-grip-concentration-curl';

update exercise_template
   set title_zh = $zh$绳索反握高位下拉$zh$,
       how_to_zh = $zh$1. 选择合适的配重。
2. 调整垫板高度，使双腿被稳固卡住。
3. 站直，双手以均匀的反握握住横杆（掌心朝后）。
4. 坐下并肩部后收。
5. 吸气，将横杆拉至胸前。立即呼气。
6. 吸气的同时伸直手臂。
$zh$
 where slug = 'reverse-grip-lat-pulldown-cable';

update exercise_template
   set title_zh = $zh$反握肱三头肌下压$zh$,
       how_to_zh = $zh$1. 将滑轮调至最高位置，装上横杆并选择配重。
2. 以掌心向上的姿势握住横杆。
3. 肘部贴近身体两侧，后退一步将配重拉起。
4. 略微前倾，为最低点的手臂完全伸展留出空间。
5. 肩部后收，吸气，呼气的同时伸直手臂。
6. 缓慢屈臂，直至手腕略高于肘部，吸气。
7. 重复。
$zh$
 where slug = 'reverse-grip-triceps-pushdown';

update exercise_template
   set title_zh = $zh$反向山羊挺身$zh$,
       how_to_zh = $zh$1. 为器械加上合适的配重。
2. 调整脚垫，使其在你俯卧于器械上时抵住跟腱。
3. 俯卧于器械上，髋部位于垫板边缘，握住把手保持支撑。
4. 将双脚固定在下方垫板之间。
5. 肩部后收并吸气。
6. 以连贯动作抬起双腿，直至身体成一条直线，在最高点呼气。
7. 吸气的同时将双腿缓慢放回起始位置。
$zh$
 where slug = 'reverse-hyperextension';

update exercise_template
   set title_zh = $zh$反向弓步$zh$,
       how_to_zh = $zh$1. 站直，肩部后收，腹部收紧，双手叉腰。
2. 双脚站于舒适位置，脚尖略微外展。
3. 吸气，右腿向后迈出，以前脚掌落地。屈前腿下蹲成弓步。合适的步幅是下蹲时前腿小腿基本保持垂直（膝盖位于脚踝上方）。
4. 下降至前腿大腿几乎与地面平行，后膝距地面一两英寸。
5. 在最低点稍作停顿，前腿发力回到起始站立位。
6. 右腿收回起始位置并呼气。
7. 再次吸气，左腿向后迈出做弓步。
8. 持续交替进行。
$zh$
 where slug = 'reverse-lunge';

update exercise_template
   set title_zh = $zh$杠铃反向弓步$zh$,
       how_to_zh = $zh$1. 将杠铃置于背上，双手握住。
2. 站直，肩部后收，收紧腹部，双脚站于舒适位置。
3. 吸气，右腿向后迈出，以前脚掌落地。
4. 屈前腿，有控制地下蹲成弓步。
5. 下降至前腿大腿几乎与地面平行，后膝距地面一两英寸。下蹲时前腿小腿应基本保持垂直。
6. 在最低点稍作停顿，前脚跟发力伸腿回到站立位。呼气。
7. 再次吸气，左腿向后迈出做弓步，以前脚掌落地。
8. 持续交替进行，直至完成该组。
$zh$
 where slug = 'reverse-lunge-barbell';

update exercise_template
   set title_zh = $zh$哑铃反向弓步$zh$,
       how_to_zh = $zh$1. 拿起一对哑铃并站直。
2. 双脚站于舒适位置，肩部后收，收紧腹部。
3. 吸气，右腿向后迈出，以前脚掌落地。随即屈前腿下蹲成弓步。
4. 下降至前腿大腿几乎与地面平行，后膝距地面一两英寸。合适的步幅是下蹲时前腿小腿基本保持垂直（膝盖位于脚踝上方）。
5. 在最低点稍作停顿，前腿发力回到站立位，同时呼气。
6. 再次吸气，左腿向后迈出做弓步，以前脚掌落地。
7. 持续交替进行。
$zh$
 where slug = 'reverse-lunge-dumbbell';

update exercise_template
   set title_zh = $zh$反向平板支撑$zh$,
       how_to_zh = $zh$1. 坐于地面，双腿伸直，双脚并拢。
2. 双臂向身体两侧及后方伸出。保持肘部伸直，手掌平贴地面。
3. 双手撑稳，收紧臀部，髋部向天花板方向顶起，同时抬起躯干。
4. 使头、颈、躯干和双腿成一条直线。保持手臂伸直并抬头向上看。
5. 保持臀部和核心收紧，平稳呼吸，维持平板支撑姿势。
6. 完成后，将臀部放回地面并休息。
$zh$
 where slug = 'reverse-plank';

update exercise_template
   set title_zh = $zh$哑铃反握腕弯举$zh$,
       how_to_zh = $zh$1. 拿起一对哑铃，坐在平板健身凳上。
2. 将肘部和前臂放在大腿上，掌心向下。手腕应位于膝盖正前方，哑铃自然下垂。
3. 吸气并伸展手腕，将哑铃向上抬起。在最高点呼气。
4. 吸气的同时缓慢放下重量。
5. 重复。
$zh$
 where slug = 'reverse-wrist-curl-dumbbell';

update exercise_template
   set title_zh = $zh$吊环臂屈伸$zh$,
       how_to_zh = $zh$1. 将吊环高度调至约与腹部齐平。
2. 站在吊环之间，双手握住吊环。
3. 保持手臂伸直，肘部贴近身体。
4. 肩部后收，收紧腹部，夹紧臀部。
5. 吸气，双脚依次离开地面。
6. 确认身体足够稳定后，再次吸气并屈臂。
7. 逐渐下降，直至肘部弯曲到一定程度并感到胸部有拉伸感。
8. 呼气的同时用肱三头肌发力推回最高点。避免爆发式动作，以免造成身体不稳。
$zh$
 where slug = 'ring-dips';

update exercise_template
   set title_zh = $zh$吊环引体向上$zh$,
       how_to_zh = $zh$1. 固定一对吊环，将其调至引体向上杆的高度。
2. 向上伸臂，以正握握住吊环（掌心朝前）。
3. 肩部后收下沉，收紧腹部。
4. 屈膝或双脚稍向前伸，使身体悬空。
5. 吸气，以连贯动作将自己拉起。在最高点呼气。
6. 吸气的同时缓慢伸直手臂。
$zh$
 where slug = 'ring-pull-up';

update exercise_template
   set title_zh = $zh$吊环俯卧撑$zh$,
       how_to_zh = $zh$1. 固定一对吊环，将其调至距地面一两英寸处。
2. 双膝跪地，握住吊环。
3. 肩部后收，收紧肱三头肌、胸肌和腹部，以获得最大稳定性。
4. 伸直双腿成俯卧撑姿势。以下半身支撑于脚尖。
5. 夹紧臀部以进一步稳定身体。
6. 吸气，保持肘部贴近躯干，缓慢下降至地面。
7. 在力量允许范围内尽量下降，呼气的同时推回最高点。
8. 吸气并重复。
$zh$
 where slug = 'ring-push-up';

update exercise_template
   set title_zh = $zh$杠铃罗马尼亚硬拉$zh$,
       how_to_zh = $zh$1. 双手以双正握握住杠铃（掌心朝后）。双手间距应与肩同宽。
2. 站直，肩胛骨后收，收紧腹部，双脚站于舒适位置。
3. 吸气，臀部后移（以髋为轴）前倾躯干。整个过程中背部应保持中立。
4. 沿垂直直线放下杠铃，使其贴近身体。应感到腘绳肌有拉伸感。
5. 髋部前送挺直身体，在接近最高点时呼气。
$zh$
 where slug = 'romanian-deadlift-barbell';

-- 0017 fragment 09 — romanian-deadlift-dumbbell .. side-plank
update exercise_template
   set title_zh = $zh$哑铃罗马尼亚硬拉$zh$,
       how_to_zh = $zh$1. 双手各握一只哑铃，站直。
2. 将哑铃置于髋部前方，掌心朝向身体。
3. 肩部后收，双脚分开约几英寸，吸气。
4. 以髋部为轴向前俯身。背部保持中立，应感到大腿后侧有拉伸感。
5. 沿直线下放哑铃，直至低于膝盖高度。
6. 髋部向前挺送并呼气。
$zh$
 where slug = 'romanian-deadlift-dumbbell';

update exercise_template
   set title_zh = $zh$史密斯机罗马尼亚硬拉$zh$,
       how_to_zh = $zh$1. 将杠铃置于大腿中部高度并加好重量。
2. 靠近杠铃站立，大腿几乎贴住杠铃。双脚与髋同宽。
3. 用正握（掌心向后）握住杠铃。双手约与肩同宽。
4. 起杠并站直。
5. 肩部后收，收紧腹部，吸气。
6. 躯干前倾、臀部后推，缓慢下放杠铃。应感到大腿后侧有紧绷感。
7. 前倾至躯干几乎与地面平行，然后髋部向前发力站起，在顶端呼气。
8. 下放时吸气，重复动作。
$zh$
 where slug = 'romanian-deadlift-smith-machine';

update exercise_template
   set title_zh = $zh$绳索弯举$zh$,
       how_to_zh = $zh$1. 将滑轮调至最低位置并挂上绳索。
2. 在绳索器械上选择合适的重量。
3. 俯身，用对握（掌心相对）抓住绳索两端。
4. 站直，肩部后收，后撤一步将配重从配重片中拉起。
5. 吸气，屈肘弯举绳索。
6. 上举至手腕略高于肘部，呼气。
7. 缓慢伸直手臂并吸气。
$zh$
 where slug = 'rope-cable-curl';

update exercise_template
   set title_zh = $zh$绳索直臂下压$zh$,
       how_to_zh = $zh$1. 选择合适的重量。
2. 将滑轮调至最高位置并挂上绳索。
3. 双手对握（掌心相对）抓住绳索两端，手臂伸直。
4. 后撤一步，收紧腹部，肩部后收。
5. 吸气，保持手臂伸直将绳索拉向髋部。呼气。
6. 缓慢将绳索送回上方，同时吸气。
$zh$
 where slug = 'rope-straight-arm-pulldown';

update exercise_template
   set title_zh = $zh$划船机$zh$,
       how_to_zh = $zh$1. 选择合适的阻力并坐下。
2. 向前伸手抓住拉柄。
3. 屈膝，双脚平放在脚踏板上。
4. 手臂伸直，吸气，用大腿发力向后蹬。
5. 后移的同时将拉柄拉向躯干并呼气。
6. 同时伸直手臂、弯曲膝盖，回到起始位置，同时吸气。
$zh$
 where slug = 'rowing-machine';

update exercise_template
   set title_zh = $zh$跑步$zh$,
       how_to_zh = $zh$1. 站直，肩部后收。
2. 向前移动，以中足落地：用脚掌中部接触地面。
3. 手臂保持弯曲，双手放松。
4. 手臂自然地与脚步协调摆动。
5. 落地要轻，但避免在前进时上下弹跳。
6. 保持躯干直立、核心收紧，目光看向身前几英尺处。
7. 保持平稳呼吸，尽量用鼻子吸气、用嘴呼气。
$zh$
 where slug = 'running';

update exercise_template
   set title_zh = $zh$自重俄罗斯转体$zh$,
       how_to_zh = $zh$1. 坐在地面上。
2. 屈膝，双脚平放地面。
3. 双臂置于躯干前方，收紧腹部并向后倾斜。
4. 吸气，将躯干转向右侧，稍作停顿并呼气。
5. 立即将躯干转回起始位置，同时吸气。
6. 转向左侧并呼气。
7. 持续交替进行。
$zh$
 where slug = 'russian-twist-bodyweight';

update exercise_template
   set title_zh = $zh$负重俄罗斯转体$zh$,
       how_to_zh = $zh$1. 拿起杠铃片或哑铃，坐在地面上。
2. 屈膝，双脚平放地面。可将脚固定在长凳下方，或让同伴按住。
3. 握住重物，置于躯干前方，双臂伸直。
4. 躯干略微后倾，收紧腹部。
5. 吸气，将重物移向右侧，同时将躯干转向该方向并呼气。
6. 将重物带回起始位置，同时吸气。
7. 转向左侧并呼气。
8. 持续交替进行。
$zh$
 where slug = 'russian-twist-weighted';

update exercise_template
   set title_zh = $zh$肩胛引体向上$zh$,
       how_to_zh = $zh$1. 用均匀的正握（掌心向前）握住引体向上杆。
2. 收紧腹部，双脚离地，使身体悬空。
3. 悬垂时保持腹部和臀部收紧，使身体稳定，不要前后摆动。
4. 吸气，肩部后收下沉，启动肩胛引体向上。手臂保持伸直。这样会使身体略微上移。
5. 保持肩胛后收的位置一两秒，同时呼气。
6. 放松身体，让肩部向前上方移动，同时吸气。
$zh$
 where slug = 'scapular-pull-ups';

update exercise_template
   set title_zh = $zh$杠铃海豹划船$zh$,
       how_to_zh = $zh$1. 给杠铃加好重量，俯卧在海豹划船凳上，身体保持笔直。
2. 用正握（掌心向后）握住杠铃，双手约与肩同宽。
3. 取下杠铃，置于胸部下方。双臂自然下垂并完全伸直。
4. 肩部后收，收紧腹部，夹紧肘部拉动杠铃。
5. 拉至肘部与躯干齐平并呼气。
6. 缓慢将杠铃放回起始位置，同时吸气。
7. 重复。
$zh$
 where slug = 'seal-row-barbell';

update exercise_template
   set title_zh = $zh$哑铃海豹划船$zh$,
       how_to_zh = $zh$1. 将哑铃放在伸手可及的位置。
2. 俯卧在海豹划船凳或加高的健身凳上（例如用两个跳箱垫高），身体保持笔直。
3. 握住哑铃，双臂自然下垂并完全伸直。
4. 肩部后收，收紧腹部，夹紧肘部拉动哑铃。
5. 拉至肘部与躯干齐平并呼气。
6. 缓慢将哑铃放回起始位置，同时吸气。
7. 重复。
$zh$
 where slug = 'seal-row-dumbbell';

update exercise_template
   set title_zh = $zh$坐姿绳索划船 - 横杆握把$zh$,
       how_to_zh = $zh$1. 选择合适的重量并坐下。
2. 向前伸手，均匀握住横杆。
3. 向后坐稳，双脚踩在脚踏板上。
4. 肩部后收，收紧腹部。
5. 吸气，将拉柄拉向胃部上方。呼气。
6. 稍作停顿，完全伸直手臂，同时吸气。
$zh$
 where slug = 'seated-cable-row-bar-grip';

update exercise_template
   set title_zh = $zh$坐姿绳索划船 - 横杆宽握$zh$,
       how_to_zh = $zh$1. 在坐姿绳索划船器械上挂上弯杆。
2. 选择合适的重量。
3. 坐下，双脚踩在踏板上，膝盖微屈。
4. 前倾，用双手正握（掌心向下）握住横杆。
5. 后倾将配重从配重片中拉起，收紧腹部，肩胛后收。
6. 吸气，将横杆划向腹部，收紧背部并呼气。
7. 缓慢伸直手臂并吸气。
$zh$
 where slug = 'seated-cable-row-bar-wide-grip';

update exercise_template
   set title_zh = $zh$坐姿绳索划船 - V 形握把$zh$,
       how_to_zh = $zh$1. 在坐姿划船器械上挂上 V 形把手并选择合适的重量。
2. 坐下，双手握住把手。
3. 双脚踩在踏板上并向后坐稳。保持膝盖微屈。
4. 肩胛后收，收紧腹部。保持躯干直立，不要过度后倾。
5. 深吸气，一次流畅地将把手拉向腹部，稍作停顿并呼气。
6. 缓慢伸直手臂，同时吸气。
$zh$
 where slug = 'seated-cable-row-v-grip-cable';

update exercise_template
   set title_zh = $zh$坐姿提踵$zh$,
       how_to_zh = $zh$1. 给器械加好重量，坐下并调整护垫。大腿应被贴合固定，使你能通过伸展踝关节将重量解锁。
2. 将大腿抵住护垫，握紧把手。
3. 吸气，收缩小腿将重量解锁。
4. 将安全杆移到一侧，屈踝下放重量，直到感到小腿有拉伸感。
5. 用前脚掌发力蹬起并收缩小腿，接近顶端时呼气。
$zh$
 where slug = 'seated-calf-raise';

update exercise_template
   set title_zh = $zh$坐姿绳索飞鸟$zh$,
       how_to_zh = $zh$1. 在双滑轮绳索器械的两侧配重片上选择相同的重量。
2. 将两个滑轮调到相同高度——大约与腹部齐平。
3. 在两个滑轮上挂好把手，将直立凳背对并置于绳索器械前方。
4. 依次拿起把手，走到健身凳前坐下。
5. 双臂在身前伸直，肩胛后收，吸气，收紧腹部。
6. 缓慢将手臂向两侧打开，直到感到胸肌有拉伸感。
7. 双手合拢，收缩胸肌并呼气。
$zh$
 where slug = 'seated-chest-flys-cable';

update exercise_template
   set title_zh = $zh$坐姿臂屈伸机$zh$,
       how_to_zh = $zh$1. 选择合适的重量。
2. 坐下，握住身体两侧的把手。
3. 双脚踩实地面，肩部后收，收紧腹部。
4. 吸气，将把手向下推，完全伸直手臂并呼气。
5. 屈臂还原，同时吸气。
$zh$
 where slug = 'seated-dip-machine';

update exercise_template
   set title_zh = $zh$坐姿上斜哑铃弯举$zh$,
       how_to_zh = $zh$1. 将健身凳调至 65 至 75 度的上斜角度。
2. 双手各握一只哑铃，向后坐稳。
3. 手臂伸直垂于身体两侧，掌心相对。
4. 肩部后收，收紧腹部，吸气。
5. 弯举两只哑铃，同时向外旋转手腕，呼气。上举至手腕略高于肘部。在顶端位置掌心应朝向天花板。
6. 缓慢伸直手臂，同时吸气。
$zh$
 where slug = 'seated-incline-curl-dumbbell';

update exercise_template
   set title_zh = $zh$坐姿上斜哑铃锤式弯举$zh$,
       how_to_zh = $zh$1. 将健身凳调至 65 至 75 度的上斜角度。
2. 双手各握一只哑铃，向后坐稳。
3. 手臂伸直垂于身体两侧，掌心相对。
4. 肩部后收，收紧腹部，吸气。
5. 保持手腕中立位，弯举两只哑铃，在顶端呼气。上举至手腕略高于肘部。
6. 缓慢伸直手臂，同时吸气。
$zh$
 where slug = 'seated-incline-hammer-curl-dumbbell';

update exercise_template
   set title_zh = $zh$坐姿哑铃侧平举$zh$,
       how_to_zh = $zh$1. 双手各握一只轻哑铃，坐在平板健身凳边缘。
2. 双手各持一只哑铃，手臂垂于身体两侧，掌心转为中立位（朝向身体）。
3. 肩部后收，收紧腹部。
4. 吸气，将哑铃向两侧举起至与肩同高。呼气。
5. 缓慢将哑铃放回身体两侧，同时吸气。
$zh$
 where slug = 'seated-lateral-raise-dumbbell';

update exercise_template
   set title_zh = $zh$坐姿固定器械腿弯举$zh$,
       how_to_zh = $zh$1. 选择合适的重量。
2. 调整护垫位置。坐下时护垫应抵住脚踝跟腱处。
3. 坐下，将小腿后侧抵住护垫，握住身体两侧的把手。
4. 肩部后收，收紧腹部，吸气。
5. 收缩腘绳肌弯曲膝盖并呼气。
6. 稍作停顿，缓慢伸直膝盖，同时吸气。
$zh$
 where slug = 'seated-leg-curl-machine';

update exercise_template
   set title_zh = $zh$坐姿杠铃过头推举$zh$,
       how_to_zh = $zh$1. 将直立健身凳放入深蹲架内。
2. 将杠铃放在架上并坐在凳上。坐姿下手臂微屈时应能触及并取下杠铃。
3. 双脚踩实地面。
4. 向上伸手，用均匀的正握（掌心向前）握住杠铃。双手约与肩同宽。
5. 收紧腹部，吸气，小心取下杠铃。
6. 将杠铃放至胸前，向后靠住凳背，挺起胸部。
7. 再次吸气，将杠铃推举过头，到顶端时呼气。
8. 将杠铃下放至锁骨高度，同时吸气。在底部位置肘部应略低于肩部。
9. 再次推举杠铃。
10. 完成后，小心将杠铃放回架上。
$zh$
 where slug = 'seated-overhead-press-barbell';

update exercise_template
   set title_zh = $zh$坐姿哑铃过头推举$zh$,
       how_to_zh = $zh$1. 双手各握一只哑铃，坐在平板健身凳或跳箱上。
2. 将哑铃放在大腿上，肩部后收，收紧腹部。
3. 一次发力将哑铃上送，置于身体两侧。
4. 吸气，将哑铃推举过头，在顶端轻碰并呼气。
5. 缓慢下放哑铃，直到肘部略低于肩部，下放过程中吸气。
$zh$
 where slug = 'seated-overhead-press-dumbbell';

update exercise_template
   set title_zh = $zh$坐姿掌心向上腕弯举$zh$,
       how_to_zh = $zh$1. 双手各握一只轻哑铃，坐在平板健身凳上。
2. 将前臂放在大腿上，手腕位于膝盖前方。
3. 吸气，伸腕下放哑铃。
4. 立即收缩前臂肌肉将哑铃抬起。在顶端稍作停顿并呼气。
$zh$
 where slug = 'seated-palms-up-wrist-curl';

update exercise_template
   set title_zh = $zh$坐姿固定器械划船$zh$,
       how_to_zh = $zh$1. 选择合适的重量。
2. 坐下，用对握（双手相对）握住把手。
3. 肩部后收，收紧腹部。
4. 吸气，同时拉动把手。
5. 收紧背部并呼气。
6. 缓慢伸直手臂并吸气。
$zh$
 where slug = 'seated-row-machine';

update exercise_template
   set title_zh = $zh$坐姿固定器械肩部推举$zh$,
       how_to_zh = $zh$1. 选择合适的重量。
2. 坐下，将肩胛贴住靠背。
3. 双脚平放踩实地面。
4. 握住身体两侧的把手，掌心保持向前。
5. 吸气，收紧腹部。
6. 将重量垂直向上推，直到手臂完全伸直。在顶端呼气。
7. 将重量放回起始位置并吸气。
$zh$
 where slug = 'seated-shoulder-press-machine';

update exercise_template
   set title_zh = $zh$坐姿肱三头肌下压$zh$,
       how_to_zh = $zh$1. 设置合适的重量并坐下。
2. 以舒适的握法握住身体两侧的把手。
3. 肩部后收，吸气，收紧腹部。
4. 将把手向下推，直到肘部锁定并呼气。
5. 缓慢屈臂还原，同时吸气。
$zh$
 where slug = 'seated-triceps-press';

update exercise_template
   set title_zh = $zh$坐姿杠铃腕弯举$zh$,
       how_to_zh = $zh$1. 用反握（掌心向前）握住直杆，坐在平板健身凳上。
2. 双脚分开，将肘部和前臂平放在凳上，手腕位于凳边。
3. 吸气，屈腕一次流畅地将杠铃抬起。
4. 在顶端稍作停顿并呼气。
5. 缓慢下放杠铃，同时吸气。
6. 重复。$zh$
 where slug = 'seated-wrist-curl-barbell';

update exercise_template
   set title_zh = $zh$坐姿杠铃腕伸展$zh$,
       how_to_zh = $zh$1. 用正握（掌心朝向身体）握住加好重量的杠铃。
2. 坐在平板健身凳边缘，双脚踩实地面。
3. 将前臂放在大腿上，手腕位于膝盖前方。
4. 吸气，屈腕将杠铃下放至膝盖前方。
5. 伸腕将杠铃抬起并呼气。
$zh$
 where slug = 'seated-wrist-extension-barbell';

update exercise_template
   set title_zh = $zh$哑铃肩部推举$zh$,
       how_to_zh = $zh$1. 将可调健身凳调至接近 90 度（靠背几乎直立）。
2. 双手各握一只哑铃，坐下。
3. 将哑铃放在大腿上方。
4. 肩部后收，收紧腹部，吸气。
5. 用大腿将哑铃向上顶起。
6. 将哑铃置于身体两侧。
7. 再次吸气，将哑铃向上向内推起，在顶端轻碰并呼气。
8. 下放哑铃直到肘部略低于肩部，下放过程中吸气。
$zh$
 where slug = 'shoulder-press-dumbbell';

update exercise_template
   set title_zh = $zh$挂片器械肩部推举$zh$,
       how_to_zh = $zh$1. 给器械加上合适的重量，确保两侧相同。
2. 调整座椅高度。坐下握住把手时，肘部应略低于肩部。
3. 坐下并握住把手。
4. 向后靠，肩胛后收。
5. 深吸气，收紧腹部。
6. 一次流畅地将重量向上推起，在顶端呼气。
7. 缓慢下放重量，同时吸气。
$zh$
 where slug = 'shoulder-press-machine-plates';

update exercise_template
   set title_zh = $zh$肩部触碰$zh$,
       how_to_zh = $zh$1. 双手双膝跪地。
2. 双腿向后伸直，用脚尖支撑下半身。
3. 双手平放地面，约与肩同宽。
4. 收紧腹部使身体成一条直线，肩胛后收。
5. 吸气，屈肘下降。尽量下放，然后用手掌撑起回到顶端。
6. 立即抬起左手离开地面，触碰右肩并呼气。
7. 将手放回地面，再做一次俯卧撑，下放过程中吸气。
8. 抬起右手触碰左肩。
9. 持续交替进行。
$zh$
 where slug = 'shoulder-taps';

update exercise_template
   set title_zh = $zh$杠铃耸肩$zh$,
       how_to_zh = $zh$1. 用正握（掌心向后）握住杠铃。双手应位于大腿外侧。
2. 手臂伸直，收紧腹部，肩胛后收。
3. 吸气，上提肩部做耸肩，在顶端呼气。想象用斜方肌去触碰耳朵。
4. 下放肩胛，同时吸气。
$zh$
 where slug = 'shrug-barbell';

update exercise_template
   set title_zh = $zh$绳索耸肩$zh$,
       how_to_zh = $zh$1. 将滑轮调至最低位置并挂上直杆。
2. 选择合适的重量。
3. 前倾，用正握（掌心朝向身体）握住直杆。
4. 站起并后撤一步，将配重从配重片中拉起。
5. 肩部后收，夹紧臀部，收紧腹部。
6. 吸气，上提肩胛做耸肩。在顶端呼气。
7. 缓慢下放肩胛，同时吸气。
$zh$
 where slug = 'shrug-cable';

update exercise_template
   set title_zh = $zh$哑铃耸肩$zh$,
       how_to_zh = $zh$1. 双手各握一只哑铃，站直，手臂垂于身体两侧，手腕保持中立。
2. 肩部后收，收紧腹部。
3. 吸气，尽量向上耸肩，在顶端收紧斜方肌。手臂保持伸直。
4. 在顶端呼气，将肩胛放回起始位置，同时吸气。
$zh$
 where slug = 'shrug-dumbbell';

update exercise_template
   set title_zh = $zh$固定器械耸肩$zh$,
       how_to_zh = $zh$1. 给器械加上合适的重量。
2. 站在把手之间，握住把手并站直。
3. 手臂伸直垂于身体两侧，深吸气并收紧腹部。
4. 一次流畅地向上耸肩，在顶端呼气。不要屈肘。
5. 下放肩胛，同时吸气。
$zh$
 where slug = 'shrug-machine';

update exercise_template
   set title_zh = $zh$史密斯机耸肩$zh$,
       how_to_zh = $zh$1. 将史密斯机杠铃调至髋部高度并加好重量。
2. 背对杠铃，用正握（掌心向后）握住杠铃。
3. 收紧腹部，吸气。
4. 旋转杠铃将其解锁。
5. 尽量向上耸肩，在顶端收紧斜方肌并呼气。
6. 下放肩胛并吸气。
7. 完成后，旋转杠铃将其挂回史密斯机。
$zh$
 where slug = 'shrug-smith-machine';

update exercise_template
   set title_zh = $zh$体侧屈$zh$,
       how_to_zh = $zh$1. 侧身站在下背伸展器械上。右大腿上部应抵住护垫，双脚固定牢靠。
2. 收紧腹部，双手置于脑后。
3. 吸气，将躯干向右侧屈。
4. 收缩腹斜肌将躯干向左侧屈并呼气。
5. 完成后，身体旋转 180 度，做相同次数的动作。
$zh$
 where slug = 'side-bend';

update exercise_template
   set title_zh = $zh$哑铃体侧屈$zh$,
       how_to_zh = $zh$1. 右手握住哑铃，手臂垂于体侧站直。左手置于脑后。
2. 收紧腹部，肩部后收。
3. 吸气，将躯干向左侧屈。呼气。
4. 伸直躯干并吸气。
5. 再次侧屈。
6. 完成后，换另一只手握住哑铃，做相同次数的动作。
$zh$
 where slug = 'side-bend-dumbbell';

update exercise_template
   set title_zh = $zh$侧平板支撑$zh$,
       how_to_zh = $zh$1. 向左侧卧。
2. 左前臂撑地保持平衡。
3. 双腿叠放，一只脚放在另一只脚上。
4. 吸气，收紧核心将髋部抬离地面。
5. 保持该姿势 30 至 60 秒，然后放松。
6. 转向另一侧，保持同样的姿势。
$zh$
 where slug = 'side-plank';

-- 0017 fragment 10 — single-arm-cable-crossover .. squat-barbell
update exercise_template
   set title_zh = $zh$单臂绳索夹胸$zh$,
       how_to_zh = $zh$1. 将滑轮调至胸部高度，装上把手。
2. 选择合适的重量。
3. 握住把手，离开器械，侧身面对器械。滑轮应位于身体侧面并略靠后。
4. 肩部后收，吸气，收紧腹部。
5. 手臂微屈置于体侧，将绳索拉至躯干前方。挤压胸肌并呼气。
6. 缓慢将手臂移回体侧并吸气。
7. 完成后换另一只手握住把手，让滑轮位于身体侧面并略靠后，做相同的次数。
$zh$
 where slug = 'single-arm-cable-crossover';

update exercise_template
   set title_zh = $zh$单臂绳索划船$zh$,
       how_to_zh = $zh$1. 将绳索滑轮调至低位或胸部高度，装上把手。
2. 选择合适的重量，握住把手，后退一步将重量从配重片中提起。
3. 肩部后收，双脚前后站位，膝盖微屈，收紧腹部并吸气。
4. 将把手拉向体侧，肘部与躯干对齐。挤压背部并短暂停留，呼气。
5. 缓慢伸直手臂并吸气。
6. 一侧训练完成后，换另一只手握住把手，做相同的次数。
$zh$
 where slug = 'single-arm-cable-row';

update exercise_template
   set title_zh = $zh$绳索单臂弯举$zh$,
       how_to_zh = $zh$1. 选择合适的重量，将滑轮调至最低位，装上把手。
2. 用右手握住把手，掌心朝上。
3. 后退一步，吸气，收紧腹部。
4. 弯举重量，在顶端短暂挤压肱二头肌并呼气。
5. 缓慢伸直手臂并吸气。
6. 完成后换左手握住把手，重复动作。
$zh$
 where slug = 'single-arm-curl-cable';

update exercise_template
   set title_zh = $zh$杠铃单臂地雷管推举$zh$,
       how_to_zh = $zh$1. 将杠铃一端固定在地雷管底座上。
2. 在杠铃另一端加上杠铃片。
3. 身体前倾，双手握住装片的一侧。
4. 小心将杠铃抬至胸部高度并站直。
5. 肩部后收，收紧腹部，将左臂抬至体侧。
6. 吸气，将杠铃向前上方推起，直至手臂伸直。在顶端呼气。
7. 缓慢将杠铃放回上胸位置并吸气。
8. 一侧训练完成后，换左手握住杠铃，做相同的次数。
$zh$
 where slug = 'single-arm-landmine-press-barbell';

update exercise_template
   set title_zh = $zh$单臂高位下拉$zh$,
       how_to_zh = $zh$1. 选择合适的重量，在滑轮上装上把手。
2. 调整膝垫高度，使大腿刚好紧贴其下。
3. 站直，向上伸展，单手握住把手。
4. 坐下，将大腿固定在膝垫下方。
5. 手臂伸直，肩胛骨后收，收紧核心并吸气。
6. 将绳索向下向内拉，直到感觉背部收缩。保持肘部与躯干在同一直线上并贴近身体。
7. 短暂停留并呼气。
8. 缓慢伸直手臂并吸气，准备下一次动作。
9. 完成后站起，换另一只手握住把手，做相同的次数。
$zh$
 where slug = 'single-arm-lat-pulldown';

update exercise_template
   set title_zh = $zh$绳索单臂侧平举$zh$,
       how_to_zh = $zh$1. 选择合适的重量，将滑轮调至最低位，装上把手。
2. 左侧朝向绳索接口站立，用右手握住把手。
3. 向侧面迈一步将重量从配重片中提起，右臂保持微屈。
4. 吸气，收紧腹部，将手臂向侧面抬起，直至手腕和肘部与肩部齐平。在顶端呼气。
5. 缓慢放下手臂并吸气。
6. 一侧训练完成后，身体转体 180 度，换左手握住把手，重复动作。
$zh$
 where slug = 'single-arm-lateral-raise-cable';

update exercise_template
   set title_zh = $zh$哑铃单臂肱三头肌屈伸$zh$,
       how_to_zh = $zh$1. 拿起一只哑铃，坐在平板凳或椅子上。
2. 将重量举过头顶并伸直手臂。
3. 肩部后收，收紧核心并吸气。
4. 保持肘部稳定，将哑铃放至头后。
5. 屈臂直至感觉肱三头肌被拉伸，呼气时伸直肘部。
6. 完成后换另一只手握住哑铃，做相同的次数。
$zh$
 where slug = 'single-arm-tricep-extension-dumbbell';

update exercise_template
   set title_zh = $zh$绳索单臂肱三头肌下压$zh$,
       how_to_zh = $zh$1. 选择合适的重量，将滑轮调至最高位，装上绳索。
2. 用右手握住绳索，肘部置于体侧，后退一步。
3. 左手扶住绳索器械的立柱，深吸气，收紧腹部。
4. 缓慢伸直手臂并在呼气时收紧肱三头肌。
5. 吸气时屈臂。
6. 完成后换左手握住绳索，重复动作。
$zh$
 where slug = 'single-arm-triceps-pushdown-cable';

update exercise_template
   set title_zh = $zh$单腿屈伸$zh$,
       how_to_zh = $zh$1. 在腿屈伸器械上选择合适的重量。
2. 坐下时调整靠垫，使其刚好位于脚部上方。
3. 调整靠背，使膝盖位于坐垫边缘前方。
4. 坐下，将一条腿抵住靠垫，双手握住身体两侧的把手，肩部后收并吸气。
5. 完全伸直腿并呼气。
6. 吸气时屈腿。
7. 一侧训练完成后，换另一条小腿抵住靠垫，做相同的次数。
$zh$
 where slug = 'single-leg-extensions';

update exercise_template
   set title_zh = $zh$单腿臀桥$zh$,
       how_to_zh = $zh$1. 铺好瑜伽垫，仰卧，双臂置于体侧，手掌平贴地面。
2. 屈膝，双脚平放在地面上。
3. 将一条腿抬起悬空。
4. 吸气，通过支撑脚的脚跟发力，收紧后侧链，将髋部向上顶向天花板。
5. 伸展髋部直至与膝盖和肩部成一直线，在顶端呼气。
6. 将臀部放回地面，下落时吸气。
7. 交换双腿位置，另一侧做相同的次数。
$zh$
 where slug = 'single-leg-glute-bridge';

update exercise_template
   set title_zh = $zh$单腿臀推$zh$,
       how_to_zh = $zh$1. 坐在地面上，上背靠住平板凳。
2. 双臂置于体侧，平放在平板凳上。
3. 屈膝，双脚平放在地面上。
4. 将一只脚抬离地面，吸气，收紧腹部。
5. 通过另一只脚发力，伸展髋部直至与躯干成一直线。呼气。
6. 吸气时将臀部放回地面。
7. 完成后换另一只脚踩地，做相同的次数。
$zh$
 where slug = 'single-leg-hip-thrust';

update exercise_template
   set title_zh = $zh$哑铃单腿臀推$zh$,
       how_to_zh = $zh$1. 将一只哑铃放在平板凳旁。
2. 坐在地面上，上背抵住凳子边缘，拿起哑铃并置于髋部上方。
3. 屈右膝，右脚踩地。左腿保持伸直。
4. 深吸气，收紧腹部，通过右脚跟发力将髋部顶向天花板。为安全起见，双手握住哑铃。
5. 在顶端短暂停留并呼气。
6. 吸气时将臀部放回地面。
7. 重复。
8. 右侧训练完成后，左脚踩地并伸直右腿。做相同的次数。
$zh$
 where slug = 'single-leg-hip-thrust-dumbbell';

update exercise_template
   set title_zh = $zh$单腿固定器械腿举$zh$,
       how_to_zh = $zh$1. 在器械上设置合适的重量并坐下。
2. 一只脚平踩在踏板上，双手握住身体两侧的把手。另一只脚放在地面上。
3. 收紧腹部并吸气。
4. 伸直腿并取下安全锁。
5. 缓慢屈膝，吸气时将身体靠近踏板。
6. 通过脚跟发力，呼气时伸直腿。
7. 一条腿训练完成后，换另一只脚踩上踏板，做相同的次数。
$zh$
 where slug = 'single-leg-press-machine';

update exercise_template
   set title_zh = $zh$杠铃单腿罗马尼亚硬拉$zh$,
       how_to_zh = $zh$1. 用双手正握握住杠铃（掌心朝后）。双手与肩同宽。
2. 站直，双脚并拢，背部挺直，肩部后收，收紧腹部。
3. 吸气，以髋部为轴向前俯身。同时将右脚抬离地面，右腿向后伸展以保持平衡。
4. 向前俯身直至感觉左腿腘绳肌被拉伸。杠铃沿直线下降，始终贴近身体。
5. 呼气时挺直身体，将右腿收回前方。
6. 再次吸气并重复。
7. 一侧训练完成后，抬起左脚并将腿向后伸展，做相同的次数。
$zh$
 where slug = 'single-leg-romanian-deadlift-barbell';

update exercise_template
   set title_zh = $zh$哑铃单腿罗马尼亚硬拉$zh$,
       how_to_zh = $zh$1. 一只手握住哑铃，置于大腿前侧。
2. 将右脚抬离地面，用左脚支撑身体。
3. 肩部后收，收紧腹部并吸气。
4. 以髋部为轴缓慢向前俯身。让右腿向后移动以保持平衡。
5. 向前俯身直至感觉左大腿后侧被拉伸。
6. 挺直身体，收紧臀部并呼气。
7. 完成后右脚踩地，抬起左脚，做相同的次数。
$zh$
 where slug = 'single-leg-romanian-deadlift-dumbbell';

update exercise_template
   set title_zh = $zh$单腿站姿提踵$zh$,
       how_to_zh = $zh$1. 将右脚前脚掌踩在垫高的平台上，并抓住固定物保持平衡。
2. 肩部后收，收紧腹部，伸直右腿。
3. 吸气，屈踝将脚跟向下放至地面。
4. 下放至感觉小腿被拉伸，再通过脚跟发力伸展踝关节。
5. 在顶端挤压小腿并呼气。
6. 完成后换另一只脚的前脚掌踩上平台，做相同的次数。
$zh$
 where slug = 'single-leg-standing-calf-raise';

update exercise_template
   set title_zh = $zh$单腿站姿杠铃提踵$zh$,
       how_to_zh = $zh$1. 将负重的杠铃置于上背，方式与深蹲相同。
2. 将一只脚的前脚掌踩在垫高的平台上，另一只脚留在平台上以保持平衡。
3. 肩部后收，收紧腹部并吸气。
4. 伸展踝关节，在顶端挤压小腿肌肉。呼气。
5. 吸气时屈踝下放回起始位置。
6. 完成后换另一只脚的前脚掌踩上平台，重复做相同的次数。
$zh$
 where slug = 'single-leg-standing-calf-raise-barbell';

update exercise_template
   set title_zh = $zh$单腿站姿哑铃提踵$zh$,
       how_to_zh = $zh$1. 左手握住一只哑铃，将右脚前脚掌踩在垫高的平台上。左脚保持悬空。
2. 右手抓住固定物保持平衡。
3. 收紧腹部，吸气，伸直右腿。
4. 通过前脚掌发力将身体抬起，呼气时挤压小腿。
5. 屈踝缓慢下放身体并吸气。应感觉小腿被拉伸。
6. 重复。
7. 完成后换左脚前脚掌踩上平台，做相同的次数。
$zh$
 where slug = 'single-leg-standing-calf-raise-dumbbell';

update exercise_template
   set title_zh = $zh$单腿站姿固定器械提踵$zh$,
       how_to_zh = $zh$1. 在器械上选择合适的重量。
2. 将右脚前脚掌踩在踏板上，肩部抵住靠垫。保持腿伸直。
3. 握住把手支撑，收紧腹部并吸气。
4. 通过前脚掌发力伸展踝关节，呼气时挤压小腿肌肉。
5. 缓慢下放踝关节，拉伸小腿。下落时吸气。
6. 右小腿训练完成后，换左脚踩上踏板，重复做相同的次数。
$zh$
 where slug = 'single-leg-standing-calf-raise-machine';

update exercise_template
   set title_zh = $zh$负重西斯深蹲$zh$,
       how_to_zh = $zh$1. 拿起一片杠铃片，举至胸前，用单臂托住。
2. 站在健身凳或其他可扶持的物体前。
3. 抓住物体以保持支撑。
4. 双脚间距几英寸，收紧腹部并吸气。
5. 下蹲的同时将躯干向后倾。
6. 下蹲过程中让脚跟抬离地面，用前脚掌支撑身体。
7. 尽可能下蹲，感受股四头肌被拉伸。
8. 收紧股四头肌伸直双腿并站起。在接近顶端时呼气。
$zh$
 where slug = 'sissy-squat-weighted';

update exercise_template
   set title_zh = $zh$仰卧起坐$zh$,
       how_to_zh = $zh$1. 在地面上铺好瑜伽垫并仰卧其上。
2. 屈膝，双脚平放在地面上。
3. 双手置于面部前方或头后。
4. 吸气，收紧腹部卷起躯干，将上身抬至坐直位置。
5. 在顶端呼气，并在吸气时缓慢放下躯干。
$zh$
 where slug = 'sit-up';

update exercise_template
   set title_zh = $zh$负重仰卧起坐$zh$,
       how_to_zh = $zh$1. 将一只哑铃或杠铃片放在地面上，躺在旁边。
2. 屈膝，双脚平放在地面上。
3. 拿起重量并置于胸前。
4. 吸气，收紧腹部卷起躯干，将上身抬至坐直位置。呼气。
5. 短暂停留，并在吸气时缓慢放下躯干。
$zh$
 where slug = 'sit-up-weighted';

update exercise_template
   set title_zh = $zh$滑冰$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）$zh$
 where slug = 'skating';

update exercise_template
   set title_zh = $zh$滑雪机$zh$,
       how_to_zh = $zh$1. 选择合适的阻力，最好为最大阻力的 50-60%。
2. 向上伸展，双手握住两个把手，稍微后退以留出足够的拉动空间。
3. 双脚与肩同宽或略宽。
4. 屈肘，吸气，收紧核心并向后顶髋，开始拉动。
5. 拉动绳索时利用初始惯性，继续以髋部为轴俯身，双臂完全伸展将把手向下压，并呼气。
6. 站立起身时让绳索回到起始位置，并吸气准备下一次动作。
7. 保持呼吸、拉动、俯身和站起的节奏，以可控且有韵律的方式进行。
$zh$
 where slug = 'ski-erg';

update exercise_template
   set title_zh = $zh$滑雪$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）$zh$
 where slug = 'skiing';

update exercise_template
   set title_zh = $zh$杠铃仰卧臂屈伸$zh$,
       how_to_zh = $zh$1. 装上直杆杠铃，将其从地面提起，支撑在胸前。
2. 小心坐到平板凳上，保持杠铃贴近躯干并躺下。
3. 伸直手臂，肩部后收。双脚踩实地面。
4. 吸气，将杠铃下放至额头或头后。
5. 短暂停留，保持肘部位置不变伸直手臂。在接近顶端时呼气。
$zh$
 where slug = 'skullcrusher-barbell';

update exercise_template
   set title_zh = $zh$哑铃仰卧臂屈伸$zh$,
       how_to_zh = $zh$1. 拿起一对哑铃，仰卧在平板凳上。
2. 伸直手臂，将哑铃置于胸部上方，手腕保持中立（双手相对）。
3. 肩部后收，收紧腹部，双脚平踩在地面上。
4. 吸气，缓慢屈肘将哑铃下放至头部两侧。
5. 短暂停留，收紧肱三头肌伸直手臂。在接近顶端时呼气。
$zh$
 where slug = 'skullcrusher-dumbbell';

update exercise_template
   set title_zh = $zh$雪橇拉$zh$,
       how_to_zh = $zh$1. 双手握住连接雪橇的绳索。
2. 站直，双脚与髋同宽。
3. 臀部向后顶，身体略微前倾，保持脊柱中立。
4. 用右手拉绳索。
5. 当肘部到达躯干侧面时，立即换左手拉绳，同时右手沿绳索向前下方移动，准备下一次拉动。为有效呼吸，换手时吸气，就在开始每次拉动之前，拉动时呼气。
6. 持续有节奏地交替拉动并换手，保持稳定的节奏。
$zh$
 where slug = 'sled-pull';

update exercise_template
   set title_zh = $zh$雪橇推$zh$,
       how_to_zh = $zh$1. 在雪橇上装载合适重量的配重。
2. 身体前倾，双手握住两个把手并伸直手臂。
3. 肩部后收，收紧腹部，前脚掌着地。
4. 吸气，通过前脚掌发力向前推动。
5. 缓慢向前推进，用脚掌发力。保持平稳呼吸，尽可能坚持更长时间。
$zh$
 where slug = 'sled-push';

update exercise_template
   set title_zh = $zh$抓举$zh$,
       how_to_zh = $zh$1. 站在装好杠铃片的杠铃前。双脚位于杠铃下方，小腿距杠铃约几英寸。
2. 向前俯身，用宽握抓举握法握住杠铃。
3. 降低髋部，肩部后收使背部挺直，身体贴向杠铃。膝盖应位于杠铃上方。
4. 收紧腹部并吸气。
5. 像做深蹲一样，用力通过脚跟向上发力。
6. 当杠铃贴近身体滑行至髋部时，再次通过脚跟发力，有力伸展膝和髋。同时将杠铃沿垂直线向上拉起。
7. 屈膝下蹲，手臂伸直接住过顶的杠铃。
8. 通过脚跟发力完成过头深蹲，在顶端呼气。
9. 将杠铃放回地面，始终贴近身体。
$zh$
 where slug = 'snatch';

update exercise_template
   set title_zh = $zh$单板滑雪$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）$zh$
 where slug = 'snowboarding';

update exercise_template
   set title_zh = $zh$杠铃蜘蛛弯举$zh$,
       how_to_zh = $zh$1. 将健身凳调至约 45 度的上斜角度。
2. 俯卧在凳上，腹部和胸部贴紧靠垫。
3. 向下伸手，用均匀的反握握住杠铃（掌心朝前）。也可以请他人把杠铃递给你。
4. 收紧腹部并吸气。
5. 保持肘部不动，弯举杠铃。
6. 屈臂直至手腕高于肘部。收紧肱二头肌并呼气。
7. 缓慢放下杠铃，吸气时完全伸直手臂。
$zh$
 where slug = 'spider-curl-barbell';

update exercise_template
   set title_zh = $zh$哑铃蜘蛛弯举$zh$,
       how_to_zh = $zh$1. 将健身凳调至 45 至 60 度的上斜角度。
2. 拿起一对哑铃，坐在凳上，胸部和腹部贴紧靠垫。手臂自然下垂，掌心朝前。
3. 深吸气，同时弯举两只哑铃，肘部不要前移。在顶端呼气。
4. 吸气时伸直手臂。
$zh$
 where slug = 'spider-curl-dumbbell';

update exercise_template
   set title_zh = $zh$蜘蛛人式平板支撑$zh$,
       how_to_zh = $zh$1. 俯身四点支撑，进入肘撑平板支撑姿势。
2. 前臂平贴地面支撑上半身，双腿伸展，脚尖支撑下半身。
3. 臀部略微抬高，背部保持中立，收紧腹部以支撑。
4. 吸气，将右膝收向右侧肘部，呼气。
5. 吸气时将膝盖收回起始位置。
6. 将左膝收向左侧肘部。
7. 持续左右交替，直至完成该组。
$zh$
 where slug = 'spiderman';

update exercise_template
   set title_zh = $zh$动感单车$zh$,
       how_to_zh = $zh$1. 调整座椅高度并坐上动感单车。
2. 选择合适的程序并握住把手。
3. 双脚平踩在踏板上，肩部后收，目光平视前方。
4. 稳定骑行，保持均匀呼吸。
$zh$
 where slug = 'spinning';

update exercise_template
   set title_zh = $zh$分腿挺$zh$,
       how_to_zh = $zh$1. 双臂宽握，将杠铃置于颈前锁骨高度。
2. 肩部后收，收紧腹部，双脚处于舒适站距。
3. 吸气，屈膝下蹲几英寸。
4. 通过脚跟发力，随即将杠铃向上推举过头。
5. 立即分腿，将惯用腿向前、非惯用腿向后，接住杠铃。
6. 双脚调整成一条直线，呼气时缓慢将杠铃放回颈前高度。
$zh$
 where slug = 'split-jerk';

update exercise_template
   set title_zh = $zh$哑铃分腿蹲$zh$,
       how_to_zh = $zh$1. 拿起一对哑铃并站直。
2. 肩胛骨后收，收紧腹部，右脚向前迈出，脚掌平踩地面。
3. 吸气，屈右膝下蹲进入分腿蹲。
4. 下蹲至后膝触地，通过前脚跟发力伸直右腿。在接近顶端时呼气。
5. 右腿训练完成后，换左腿向前，做相同的次数。
$zh$
 where slug = 'split-squat-dumbbell';

update exercise_template
   set title_zh = $zh$冲刺跑$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）$zh$
 where slug = 'sprints';

update exercise_template
   set title_zh = $zh$弹力带深蹲$zh$,
       how_to_zh = $zh$1. 取一条环状弹力带，双脚踩上去。
2. 双脚调整为舒适的深蹲站距。
3. 握住弹力带的另一端，举过头顶并置于颈后。
4. 站直，肩部后收，收紧腹部并吸气。
5. 下蹲直至大腿与地面平行。
6. 短暂停留，通过脚跟发力回到站姿。呼气。
$zh$
 where slug = 'squat-band';

update exercise_template
   set title_zh = $zh$杠铃深蹲$zh$,
       how_to_zh = $zh$1. 将杠铃设置在锁骨高度。
2. 用均匀的正握握住杠铃（掌心朝下）。
3. 钻到杠铃下方，将杠铃置于斜方肌（上背）上。
4. 调整双脚位置，收紧腹部，吸气，伸直双腿将杠铃从架上取下。
5. 小心后退几步，双脚与肩同宽。
6. 肩部后收，吸气，下蹲直至大腿与地面平行。保持脚跟贴地。
7. 短暂停留，通过脚跟发力回到站姿。在接近顶端时呼气。
8. 完成后向前走，小心将杠铃放回架上，再放松身体。
$zh$
 where slug = 'squat-barbell';

-- 0017 fragment 11 — squat-bodyweight .. triceps-extension-barbell
update exercise_template
   set title_zh = $zh$自重深蹲$zh$,
       how_to_zh = $zh$1. 站直，双脚自然分开，肩向后收，目视前方。
2. 双臂向前抬起以保持平衡，吸气。
3. 下蹲，保持脚跟贴地。
4. 下蹲至大腿与地面平行。
5. 脚跟发力站起，呼气。
$zh$
 where slug = 'squat-bodyweight';
update exercise_template
   set title_zh = $zh$哑铃深蹲$zh$,
       how_to_zh = $zh$1. 双手各持一只哑铃，站直，手臂自然垂于体侧。
2. 肩向后收，收紧腹部，双脚自然分开。
3. 吸气，屈膝下蹲。
4. 下蹲至大腿与地面平行，脚跟保持贴地。
5. 脚跟发力站起，接近顶端时呼气。
$zh$
 where slug = 'squat-dumbbell';
update exercise_template
   set title_zh = $zh$固定器械深蹲$zh$,
       how_to_zh = $zh$1. 背部与肩部贴紧靠垫。
2. 双脚与髋同宽，脚尖略微外展。
3. 肩向后收，收紧腹部，吸气。
4. 拨开安全杆，解锁重量。
5. 屈膝下蹲，脚跟保持贴地。
6. 下蹲至大腿与地面平行。
7. 脚跟发力站起，呼气。
8. 完成后放回安全杆，将重量归位。
$zh$
 where slug = 'squat-machine';
update exercise_template
   set title_zh = $zh$深蹲划船$zh$,
       how_to_zh = $zh$1. 在绳索器械上选择合适重量。
2. 将滑轮调至髋部高度，装上绳索或把手。
3. 抓住绳索配件，后退一步把重量拉起，肩向后收。
4. 手臂伸直，下蹲。
5. 下蹲至大腿与地面平行。
6. 脚跟发力站起，起身的同时立刻将重量划向腹部并呼气。
$zh$
 where slug = 'squat-row';
update exercise_template
   set title_zh = $zh$史密斯机深蹲$zh$,
       how_to_zh = $zh$1. 将史密斯机的杠铃杆调至略低于锁骨的高度。
2. 正握杠铃杆，低头钻到杆下，上背贴紧杠铃杆。
3. 双脚稍向前迈出，与髋同宽。
4. 伸膝解锁杠铃杆。
5. 收紧腹部，吸气，屈膝下蹲。
6. 下蹲至大腿与地面平行。
7. 脚跟发力站起，呼气。
8. 完成后将杠铃杆归位，放松身体。
$zh$
 where slug = 'squat-smith-machine';
update exercise_template
   set title_zh = $zh$悬吊带深蹲$zh$,
       how_to_zh = $zh$1. 抓住悬吊带把手，手臂弯曲成 90 度角。
2. 肩向后收，收紧腹部，双脚自然分开站成下蹲姿势。
3. 吸气下蹲，脚跟保持贴地。
4. 下蹲至大腿与地面平行，稍作停顿。
5. 脚跟发力站起，同时呼气。
$zh$
 where slug = 'squat-suspension';
update exercise_template
   set title_zh = $zh$爬楼机（层数）$zh$,
       how_to_zh = $zh$1. 登上器械并开机。
2. 选择低速，握住扶手支撑。
3. 踩踏移动的台阶，保持肩向后收、腹部收紧。
4. 保持均匀呼吸。
5. 熟悉器械后，将速度提高到可持续的节奏。
$zh$
 where slug = 'stair-machine-floors';
update exercise_template
   set title_zh = $zh$爬楼机（步数）$zh$,
       how_to_zh = $zh$1. 登上器械并开机。
2. 选择低速，握住扶手支撑。
3. 踩踏移动的台阶，保持肩向后收、腹部收紧。
4. 保持均匀呼吸。
5. 熟悉器械后，将速度提高到可持续的节奏。
$zh$
 where slug = 'stair-machine-steps';
update exercise_template
   set title_zh = $zh$站姿绳索臀后踢$zh$,
       how_to_zh = $zh$1. 将滑轮调至最低位置，选择合适重量。
2. 将脚踝绑带连接到滑轮上。
3. 面向绳索器械，把绑带套在右脚踝上，位于脚踝上方。
4. 身体前倾，抓住绳索器械的立柱保持平衡，收紧腹部。
5. 吸气，右腿向后一次流畅地踢出，顶端夹紧臀部并呼气。
6. 缓慢将腿放回起始位置，吸气。
7. 完成后把绑带套到另一侧脚踝，前倾，做相同次数。
$zh$
 where slug = 'standing-cable-glute-kickbacks';
update exercise_template
   set title_zh = $zh$站姿杠铃提踵$zh$,
       how_to_zh = $zh$1. 将杠铃置于颈后上背肌群上，双手扶住杠铃。
2. 前脚掌踩在垫高的平台上，脚跟落在地面。
3. 肩向后收，收紧腹部。
4. 吸气，踝关节伸展，抬起脚跟，同时夹紧小腿并呼气。
5. 脚跟缓慢下放，但不要落到地面，同时吸气。
$zh$
 where slug = 'standing-calf-raise-barbell';
update exercise_template
   set title_zh = $zh$站姿哑铃提踵$zh$,
       how_to_zh = $zh$1. 单手握住一只哑铃。
2. 前脚掌踩在垫高的平台上。
3. 另一只手扶住固定物保持平衡。
4. 伸直膝盖，夹紧臀部，收紧腹部，肩胛骨后收。
5. 吸气，踝关节屈曲，脚跟放向地面。
6. 尽量下放，感受小腿拉伸。
7. 稍作停顿，踝关节伸展将自己抬起，顶端夹紧小腿并呼气。
$zh$
 where slug = 'standing-calf-raise-dumbbell';
update exercise_template
   set title_zh = $zh$站姿固定器械提踵$zh$,
       how_to_zh = $zh$1. 选择合适的重量。
2. 肩部与上背贴紧器械靠垫。
3. 前脚掌踩在踏板上，伸直膝盖。
4. 抓住靠垫旁的手把以增加支撑。
5. 吸气，踝关节伸展，顶端夹紧小腿，呼气。
6. 缓慢下放，感受小腿在底端拉伸。下放时吸气。
$zh$
 where slug = 'standing-calf-raise-machine';
update exercise_template
   set title_zh = $zh$站姿史密斯机提踵$zh$,
       how_to_zh = $zh$1. 将杠铃杆调至合适高度，使你在完全伸膝时能够解锁杠铃杆。
2. 加上合适的重量，并在杠铃杆下方放一块提踵踏板。
3. 斜方肌顶住杠铃杆，双手扶住杠铃，前脚掌踩在踏板上。
4. 收紧全身，伸直膝盖解锁杠铃杆。
5. 吸气，踝关节缓慢屈曲将身体下放。保持膝盖伸直。
6. 在底端稍作停顿，前脚掌发力伸展踝关节。夹紧小腿，停顿片刻并呼气。
$zh$
 where slug = 'standing-calf-raise-smith';
update exercise_template
   set title_zh = $zh$站姿腿弯举$zh$,
       how_to_zh = $zh$1. 在器械上选择合适的重量。
2. 站直，握住手把支撑，将右脚跟腱贴住器械靠垫。
3. 肩向后收，收紧腹部，吸气。
4. 缓慢屈腿，直到脚踝略高于膝盖。
5. 顶端夹紧腘绳肌并呼气。
6. 缓慢伸腿，同时吸气。
7. 一侧练完后，将另一侧脚跟腱贴住靠垫，做相同次数。
$zh$
 where slug = 'standing-leg-curls';
update exercise_template
   set title_zh = $zh$站姿杠铃推举$zh$,
       how_to_zh = $zh$1. 将杠铃放在架上约锁骨高度。
2. 站在杠铃前几英寸处，正握杠铃，双手与肩同宽。
3. 双手握杆，低头钻到杆下，肩胛骨后收。
4. 吸气，收紧臀部，双腿发力解锁杠铃杆。
5. 肘部内收，背部挺直，目视前方，后退几步，双脚与髋同宽。
6. 深吸气，收紧腹部，肘部沿垂直线向上推。
7. 推至肘部锁死，呼气。
8. 缓慢将杠铃下放至颈部高度，同时吸气。
$zh$
 where slug = 'standing-military-press-barbell';
update exercise_template
   set title_zh = $zh$站姿绳索 Y 字举$zh$,
       how_to_zh = $zh$1. 将滑轮调至髋部高度，装上把手，两侧配重选择相同重量。
2. 面向器械，右手抓左侧把手，左手抓右侧把手。
3. 后退一两步，把配重拉起。
4. 站直，双臂在胸前伸直，双手交叉。
5. 肩向后收，吸气，收紧腹部。
6. 将两个把手向上向外拉，顶端呼气。
7. 缓慢将把手放回胸前起始位置，同时吸气。
8. 重复。
$zh$
 where slug = 'standing-y-raise-cable';
update exercise_template
   set title_zh = $zh$登阶$zh$,
       how_to_zh = $zh$1. 站在平凳或跳箱前。双脚与髋同宽，脚尖略微外展。
2. 肩向后收，收紧腹部。
3. 吸气，抬起右腿，将脚踩在平台上。
4. 脚跟发力伸展身体，站上平台，呼气。
5. 走下平台，再次吸气，换另一条腿伸展。
$zh$
 where slug = 'step-up';
update exercise_template
   set title_zh = $zh$吉龙达胸骨引体向上$zh$,
       how_to_zh = $zh$1. 向上抓住引体向上杆，正握（掌心朝前），双手与肩同宽或略宽。
2. 肩向后收，收紧腹部，夹紧臀部。
3. 在力量和活动度允许的范围内尽量后收肩胛骨。保持核心收紧，躯干后倾。
4. 吸气，向上拉起身体，直到下胸触到横杆，然后呼气。
5. 控制身体缓慢下放，下放时吸气。
$zh$
 where slug = 'sternum-pull-up-gironda';
update exercise_template
   set title_zh = $zh$绳索直臂高位下拉$zh$,
       how_to_zh = $zh$1. 选择合适的重量。
2. 将滑轮调至最高位置，装上直杆。
3. 正握横杆（掌心朝下）。
4. 后退一步，将重量从配重块中拉起。
5. 收紧腹部，后收肩胛骨，夹紧臀部。为保持平衡，可以前后错开站姿（一只脚前、一只脚后）。
6. 吸气，将横杆一次流畅地拉向髋部。保持手臂伸直，呼气。
7. 缓慢让横杆向前向上移动，同时吸气。
$zh$
 where slug = 'straight-arm-lat-pulldown-cable';
update exercise_template
   set title_zh = $zh$直腿硬拉$zh$,
       how_to_zh = $zh$1. 站在装有杠铃片的杠铃前。
2. 双脚位于杠铃下方，小腿距杠铃几英寸。
3. 以髋部为轴前倾。
4. 双手正握杠铃（掌心朝向身体后方）。
5. 肩向后收，收紧腹部。保持双腿伸直。
6. 吸气，沿垂直直线拉起杠铃，同时脚跟发力。
7. 顶端夹紧臀部并呼气。
8. 沿同一直线缓慢下放杠铃，下放途中或下一次动作开始前吸气。
$zh$
 where slug = 'straight-leg-deadlift';
update exercise_template
   set title_zh = $zh$拉伸$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）
$zh$
 where slug = 'stretching';
update exercise_template
   set title_zh = $zh$单臂哑铃提物行走$zh$,
       how_to_zh = $zh$1. 单手握住一只哑铃，站直。
2. 肩向后收，收紧腹部。
3. 稳步向前行走，目光看向身前几步远的地方。保持均匀呼吸。
4. 走完既定距离后，换另一只手握铃，重复。
$zh$
 where slug = 'suitcase-carry-dumbbell';
update exercise_template
   set title_zh = $zh$相扑硬拉$zh$,
       how_to_zh = $zh$1. 站在装有杠铃片的杠铃前，双脚大幅分开，脚尖外展。小腿贴近杠铃但不要接触。
2. 俯身，双手正握杠铃（掌心朝向身体后方）。双手与肩同宽，肘部距大腿内侧几英寸。
3. 肩向后收，挺起胸部。这样能挺直背部，使髋部处于正确高度，并让小腿贴住杠铃。
4. 身体绷紧，手臂伸直，向腹部吸气。
5. 脚跟踩实地面，用力拉起杠铃。
6. 杠铃沿垂直直线贴近身体移动的同时，伸膝伸髋。
7. 顶端夹紧臀部完成一次动作并呼气，但不要过度后仰背部。
8. 沿同一直线缓慢下放杠铃。下放途中或下一次动作开始前吸气。
$zh$
 where slug = 'sumo-deadlift';
update exercise_template
   set title_zh = $zh$相扑深蹲$zh$,
       how_to_zh = $zh$1. 站直，双脚宽于肩，脚尖外展。
2. 后收肩胛骨，双臂在身前抬起以保持平衡。
3. 深吸气，收紧腹部，下蹲。
4. 下蹲至大腿与地面平行，脚跟发力回到顶端，同时呼气。
$zh$
 where slug = 'sumo-squat';
update exercise_template
   set title_zh = $zh$杠铃相扑深蹲$zh$,
       how_to_zh = $zh$1. 将杠铃调至锁骨高度。
2. 双手对称地握在横杆上，略宽于肩。
3. 低头钻到杠铃下，将其置于上背。
4. 双脚踩实地面，吸气，解锁杠铃杆。
5. 后退几步。
6. 尽量加宽站距，脚尖外展。
7. 挺起胸部，吸气。
8. 缓慢下蹲，脚跟保持贴地。
9. 下蹲至大腿与地面平行，稍作停顿，脚跟发力站起，接近顶端时呼气。
$zh$
 where slug = 'sumo-squat-barbell';
update exercise_template
   set title_zh = $zh$哑铃相扑深蹲$zh$,
       how_to_zh = $zh$1. 将一只哑铃竖直放在地上，站在其前。
2. 下蹲，双手抓住最上方的铃片。
3. 站直，站成自然的下蹲姿势。宽站距（相扑站法）能提供更舒适的下蹲空间。
4. 深吸气，收紧腹部。
5. 缓慢下蹲至大腿与地面平行。
6. 脚跟发力回到顶端，同时呼气。
$zh$
 where slug = 'sumo-squat-dumbbell';
update exercise_template
   set title_zh = $zh$壶铃相扑深蹲$zh$,
       how_to_zh = $zh$1. 握住壶铃把手，站直，手臂伸直，重量置于身前。
2. 双脚宽于肩，脚尖外展。
3. 后收肩胛骨，深吸气，收紧腹部。
4. 下蹲至大腿与地面平行，稍作停顿。
5. 脚跟发力回到顶端，呼气。
$zh$
 where slug = 'sumo-squat-kettlebell';
update exercise_template
   set title_zh = $zh$超人式$zh$,
       how_to_zh = $zh$1. 俯卧在地面上，双腿伸直，双臂向头顶两侧伸展。
2. 脚趾、膝盖、大腿、腹部和胸部贴地。
3. 吸气，双臂和双腿尽量向天花板方向抬起。呼气。
4. 保持拱起姿势几秒，然后吸气并放松身体。
$zh$
 where slug = 'superman';
update exercise_template
   set title_zh = $zh$游泳$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）
$zh$
 where slug = 'swimming';
update exercise_template
   set title_zh = $zh$T 杠划船$zh$,
       how_to_zh = $zh$1. 在 T 杠器械上加一些重量。
2. 站上踏板，俯身，正握住把手。
3. 后收肩胛骨，收紧腹部，吸气。
4. 保持背部中立，脚跟发力并略微伸髋，将重量从地面拉起。
5. 保持躯干几乎与地面平行，手臂伸直。
6. 再次吸气，拉起重量，直到把手靠近躯干。顶端呼气。
7. 吸气并伸直手臂。不要把重量放回地面。
$zh$
 where slug = 't-bar-row';
update exercise_template
   set title_zh = $zh$杠铃深蹲推举$zh$,
       how_to_zh = $zh$1. 将杠铃置于前架位：扛在肩上，肘部弯曲，指尖托住杠铃。
2. 双脚站成自然的下蹲姿势。
3. 收紧腹部，吸气。
4. 下蹲，脚跟保持贴地。
5. 下蹲至大腿与地面平行。
6. 脚跟发力站起。
7. 双腿伸直的同时立刻过渡到过头推举，将杠铃向上推起并呼气。
8. 吸气，将杠铃放回前架位。
9. 再次下蹲。
$zh$
 where slug = 'thruster-barbell';
update exercise_template
   set title_zh = $zh$壶铃深蹲推举$zh$,
       how_to_zh = $zh$1. 双手各持一只壶铃，站直，将其提至肩部高度。保持肘部弯曲，壶铃置于外侧，贴靠前臂和肱二头肌（架位）。
2. 双脚与髋同宽，脚尖略微外展。
3. 肩向后收，收紧腹部，吸气，下蹲。
4. 下蹲至大腿与地面平行，脚跟发力站起。
5. 到达深蹲顶端时，将壶铃向上推起，完全伸直肘部并呼气。
6. 将壶铃下放至肩部两侧，再次吸气，下蹲。
$zh$
 where slug = 'thruster-kettlebell';
update exercise_template
   set title_zh = $zh$仰卧触趾$zh$,
       how_to_zh = $zh$1. 仰卧在地面上，双腿伸直，向天花板方向抬起。
2. 收紧腹部，双臂举于胸上方，手指向上。
3. 吸气，卷腹发力，将肩胛骨抬离地面几英寸。
4. 用手指触碰脚趾（或在一次流畅的动作中尽量卷起），并呼气。
5. 吸气，将上背放回地面。
$zh$
 where slug = 'toe-touch';
update exercise_template
   set title_zh = $zh$脚趾触杠$zh$,
       how_to_zh = $zh$1. 向上抓住引体向上杆，正握（掌心朝前）。
2. 双脚并拢，抬离地面，让身体悬空。
3. 后收肩胛骨，收紧腹部。
4. 吸气，一次流畅地将双腿抬起。
5. 尽量抬高——理想情况下，直到脚趾接近所握的引体向上杆。顶端呼气。
6. 吸气，缓慢将双腿放回起始位置。缓慢完成动作，并保持腹部收紧，防止身体来回摆动。
$zh$
 where slug = 'toes-to-bar';
update exercise_template
   set title_zh = $zh$躯干旋转$zh$,
       how_to_zh = $zh$1. 选择合适的重量。
2. 调整座椅高度，使你能够舒适地将前臂放在身体两侧的靠垫上并握住手把。
3. 屈膝，将小腿抵住下方靠垫并向前推，使全身紧绷。
4. 吸气，然后呼气时将下半身向右侧扭转。动作应流畅。
5. 吸气，缓慢将下半身转回起始位置。
6. 再呼气，将双腿转向左侧。
7. 继续左右交替，完成次数时保持均匀呼吸。
$zh$
 where slug = 'torso-rotation';
update exercise_template
   set title_zh = $zh$跑步机$zh$,
       how_to_zh = $zh$1. 站上跑步机，将安全夹夹在背心或 T 恤上。
2. 启动跑步机，从慢走逐渐加速到慢跑。
3. 保持身体挺直，目视前方，保持均匀呼吸。
4. 手臂保持弯曲，随步伐摆动。
$zh$
 where slug = 'treadmill';
update exercise_template
   set title_zh = $zh$肱三头肌臂屈伸$zh$,
       how_to_zh = $zh$1. 双手抓住双杠，让身体悬空。
2. 保持身体挺直，肩向后收，收紧腹部。
3. 吸气，屈肘下放身体。
4. 下放至肘部呈 90 度角。
5. 保持姿势片刻，用力撑回顶端，同时呼气。
$zh$
 where slug = 'triceps-dip';
update exercise_template
   set title_zh = $zh$辅助肱三头肌臂屈伸$zh$,
       how_to_zh = $zh$1. 在器械上选择合适的重量。
2. 抓住双杠，双膝跪在平台上，双腿并拢。
3. 后收肩胛骨，伸直手臂，收紧腹部。
4. 吸气，屈臂下放身体。
5. 下放至肘部呈 90 度角，稍作停顿，呼气并撑回顶端。
$zh$
 where slug = 'triceps-dip-assisted';
update exercise_template
   set title_zh = $zh$负重肱三头肌臂屈伸$zh$,
       how_to_zh = $zh$1. 用专用腰带把铃片挂在身上。
2. 双手抓住双杠，让身体悬空。
3. 保持身体挺直，肩向后收，收紧腹部。
4. 吸气，屈肘下放身体。
5. 下放至肘部呈 90 度角。
6. 保持姿势片刻，用力撑回顶端，同时呼气。
$zh$
 where slug = 'triceps-dip-weighted';
update exercise_template
   set title_zh = $zh$杠铃肱三头肌屈伸$zh$,
       how_to_zh = $zh$1. 给杠铃装上杠铃片。
2. 双手正握横杆（掌心朝向身体后方）。
3. 肩向后收，收紧腹部。
4. 将杠铃提至胸部高度。
5. 坐在平凳上。
6. 将杠铃举过头顶，伸直手臂。
7. 吸气，将杠铃下放至头后，感受肱三头肌拉伸。
8. 在底端停顿片刻，伸直手臂并呼气。
$zh$
 where slug = 'triceps-extension-barbell';

-- 0017 fragment 12 — triceps-extension-cable .. zottman-curl-dumbbell
update exercise_template
   set title_zh = $zh$绳索肱三头肌屈伸$zh$,
       how_to_zh = $zh$1. 将绳索滑轮调至低位并安装把手。
2. 用插销选择较轻的重量。
3. 俯身单手握住把手。
4. 身体转离绳索器械，将手臂向天花板方向伸直。
5. 另一只手扶住肘部支撑，肩胛后收，收紧腹部。
6. 吸气，缓慢屈肘，直到肱三头肌有拉伸感。
7. 收缩肱三头肌伸直手臂，在接近顶端时呼气。
8. 一侧肱三头肌练完后，换另一只手握住把手，完成相同次数。
$zh$
 where slug = 'triceps-extension-cable';
update exercise_template
   set title_zh = $zh$哑铃肱三头肌屈伸$zh$,
       how_to_zh = $zh$1. 拿起一只哑铃，站直。
2. 将重量举过头顶，双手平贴在最上方铃片的下方，掌心朝向天花板。
3. 肩部后收，收紧腹部。
4. 吸气，将哑铃下放至头后，保持肘部靠近头部两侧。
5. 屈臂直到有拉伸感，呼气时伸直肘部。
$zh$
 where slug = 'triceps-extension-dumbbell';
update exercise_template
   set title_zh = $zh$固定器械肱三头肌屈伸$zh$,
       how_to_zh = $zh$1. 设置合适的重量并坐下。
2. 双手握住身体两侧的把手，肩部后靠贴紧靠垫，双脚踩实地面。
3. 吸气，通过伸直肘部将把手向下推。
4. 手臂完全伸直，呼气的同时短暂保持该姿势。
5. 缓慢屈臂并吸气。
$zh$
 where slug = 'triceps-extension-machine';
update exercise_template
   set title_zh = $zh$悬吊带肱三头肌屈伸$zh$,
       how_to_zh = $zh$1. 握住悬吊带的把手，背对固定点。
2. 手臂在身体前方伸直，双脚并拢，收紧腹部。
3. 肩部后收，吸气。
4. 通过屈肘使身体前倾。
5. 下降直到肱三头肌有拉伸感。
6. 收缩手臂肌肉将身体撑起，呼气。
$zh$
 where slug = 'triceps-extension-suspension';
update exercise_template
   set title_zh = $zh$绳索肱三头肌后踢$zh$,
       how_to_zh = $zh$1. 将绳索滑轮调至低位并选择合适的重量。不要安装任何配件。
2. 右手握住绳索末端的塑料头，向后迈一步。
3. 躯干前倾，保持背部挺直。
4. 将肘部抬至躯干侧方并吸气。
5. 手臂完全伸直，呼气时短暂停顿。
6. 吸气的同时缓慢屈臂。
7. 重复。
8. 完成后换左手握住绳索，重复相同的次数。
$zh$
 where slug = 'triceps-kickback-cable';
update exercise_template
   set title_zh = $zh$哑铃肱三头肌后踢$zh$,
       how_to_zh = $zh$1. 拿起一只轻哑铃，置于体侧，掌心朝向大腿。
2. 臀部后推、躯干前倾，保持背部中立。
3. 将肘部抬至体侧，吸气，收缩肱三头肌伸直手臂。呼气。
4. 顶峰收缩保持一秒，吸气的同时缓慢放下哑铃。
5. 每次重复过程中保持肩部和肘部位置固定。
$zh$
 where slug = 'triceps-kickback-dumbbell';
update exercise_template
   set title_zh = $zh$肱三头肌下压（直杆）$zh$,
       how_to_zh = $zh$1. 在绳索器械上设置合适的重量。
2. 将滑轮调至最高位，安装直杆或 V 形杆。
3. 用正握（掌心向下）等距握住横杆。
4. 肘部贴近体侧，向后迈一步，肩胛后收。
5. 收紧腹部并吸气。
6. 手臂完全伸直，呼气时在最低位短暂保持。
7. 缓慢屈臂，直到手腕略高于肘部，同时吸气。
$zh$
 where slug = 'triceps-pressdown';
update exercise_template
   set title_zh = $zh$绳索肱三头肌下压$zh$,
       how_to_zh = $zh$1. 选择合适重量，将滑轮调至最高位，安装绳索。
2. 双手握住绳索，肘部贴近体侧。
3. 向后迈一步，躯干略微前倾。
4. 吸气，保持肘部位置不变伸直手臂。呼气。
5. 缓慢屈臂并吸气。当手腕略高于肘部时停止。
$zh$
 where slug = 'triceps-rope-pushdown';
update exercise_template
   set title_zh = $zh$杠铃直立划船$zh$,
       how_to_zh = $zh$1. 用正握（掌心朝后）握住杠铃，双手与肩同宽。
2. 站直，肩胛后收，收紧腹部，吸气。
3. 将杠铃沿直线从髋部拉至胸部并呼气。在顶端挤压上背和肱二头肌。
4. 缓慢放下手臂，下放过程中吸气。
$zh$
 where slug = 'upright-row-barbell';
update exercise_template
   set title_zh = $zh$绳索直立划船$zh$,
       how_to_zh = $zh$1. 将滑轮调至最低位，安装直杆。
2. 选择合适的重量。
3. 俯身用正握（掌心向下）握住横杆。
4. 站起并后退，将重量从配重片上提起。
5. 肩部后收，收紧腹部，一只脚略微向前支撑。
6. 吸气，用流畅的动作将横杆拉至上胸。在顶端呼气。
7. 缓慢放下手臂，同时吸气。
$zh$
 where slug = 'upright-row-cable';
update exercise_template
   set title_zh = $zh$哑铃直立划船$zh$,
       how_to_zh = $zh$1. 拿起一对哑铃，站直。双脚以舒适的站距分开，肩部后收，手臂伸直。
2. 将哑铃置于身体前方，收紧腹部。
3. 吸气，沿垂直直线将哑铃拉向上胸。在顶端呼气。
4. 放下手臂，下放过程中吸气。
$zh$
 where slug = 'upright-row-dumbbell';
update exercise_template
   set title_zh = $zh$V 字卷腹$zh$,
       how_to_zh = $zh$1. 仰卧在地面上，双腿伸直，双脚并拢，双臂向头后伸展。
2. 收紧腹部并吸气。
3. 用流畅的动作同时抬起双腿和上身，使身体折成 V 字形并呼气。
4. 在顶端短暂保持，吸气的同时缓慢放下躯干和双腿。两次重复之间不要让双脚落地。
$zh$
 where slug = 'v-up';
update exercise_template
   set title_zh = $zh$固定器械垂直牵引$zh$,
       how_to_zh = $zh$1. 选择合适的重量。
2. 背对器械，臀部靠近靠背垫，把手位于头顶上方。
3. 用对握（掌心相对）或正握（掌心向前）握住把手并坐下。
4. 挺胸，收紧腹部，吸气。
5. 将把手向下拉向身体两侧，肘部沿半弧线朝背阔肌方向移动。呼气。
6. 缓慢伸直手臂并吸气。
$zh$
 where slug = 'vertical-traction-machine';
update exercise_template
   set title_zh = $zh$哑铃侍者弯举$zh$,
       how_to_zh = $zh$1. 竖直握住一只哑铃，双手平贴在最上方铃片的下方，拇指搭在上方辅助握持。
2. 站直，双脚略宽于髋部，身体略微前倾。
3. 挺胸，收紧腹部，吸气。
4. 弯举哑铃直到手腕略高于肘部，呼气时短暂停顿。
5. 缓慢下放重量，直到手臂完全伸直。下放过程中吸气。
6. 重复。
$zh$
 where slug = 'waiter-curl-dumbbell';
update exercise_template
   set title_zh = $zh$步行$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）$zh$
 where slug = 'walking';
update exercise_template
   set title_zh = $zh$哑铃行走弓步$zh$,
       how_to_zh = $zh$1. 拿起一对哑铃，站直。
2. 肩胛后收，收紧腹部。
3. 吸气，右腿向前迈出，脚掌踩实地面。
4. 随即下蹲成弓步，直到后侧膝盖几乎接触地面。
5. 呼气时用前脚发力蹬起，伸直前腿。
6. 吸气，后脚离地向前迈出，在身体前方踩实并再次下蹲成弓步。
7. 持续向前移动到完成。
$zh$
 where slug = 'walking-lunge-dumbbell';
update exercise_template
   set title_zh = $zh$沙袋行走弓步$zh$,
       how_to_zh = $zh$1. 俯身抓住沙袋的提手。
2. 将沙袋提至胸前，向上推举过头，然后置于颈后。
3. 站直，双脚与髋同宽。吸气并收紧腹部。
4. 右腿向前迈出并踩实，下蹲成弓步，直到后侧膝盖接近或轻触地面。
5. 呼气时用前脚发力蹬伸膝盖站起。随即左腿向前迈出，使双脚并齐。
6. 吸气，左腿向前迈出踩实地面，进行下一次弓步。
7. 交替进行并持续向前移动。
$zh$
 where slug = 'walking-lunge-sandbag';
update exercise_template
   set title_zh = $zh$墙球$zh$,
       how_to_zh = $zh$1. 拿起一个中等大小的药球，站在墙前。
2. 将球举于胸前，保持肘部弯曲。
3. 双脚以适合深蹲的舒适站距分开，脚尖略微外展。
4. 收紧腹部并吸气。
5. 下蹲，保持脚跟贴地。
6. 下蹲至大腿与地面平行，然后脚跟发力起身。
7. 在双腿伸直的同时，将球向上抛向墙面并呼气。
8. 立即接住球，再次吸气，下蹲进入下一次动作。
$zh$
 where slug = 'wall-ball';
update exercise_template
   set title_zh = $zh$靠墙静蹲$zh$,
       how_to_zh = $zh$1. 背对墙面站立，距离墙壁几英寸。
2. 小心向后靠，使上背和臀部贴住墙面。
3. 收紧腹部，缓慢屈膝下蹲。
4. 调整脚的位置，使脚踝位于膝盖正下方。大腿约与地面平行。
5. 双臂可置于身前或身体两侧。
6. 保持该姿势 30 到 60 秒，同时平稳呼吸。
$zh$
 where slug = 'wall-sit';
update exercise_template
   set title_zh = $zh$热身$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）$zh$
 where slug = 'warm-up';
update exercise_template
   set title_zh = $zh$哑铃宽肘肱三头肌推举$zh$,
       how_to_zh = $zh$1. 拿起一对哑铃，坐在平板健身凳上。
2. 将哑铃放在大腿上并稳稳握住。
3. 向后躺下，屈肘，哑铃靠近身体。
4. 推起哑铃伸直手臂。掌心应朝前（朝向身体下方）。
5. 双脚踩实地面，肩部后收，收紧腹部，吸气。
6. 缓慢屈肘，将哑铃向内朝胸部下放。这会使肘部一定程度向外张开。
7. 小心将哑铃下放到胸部，呼气时伸直手臂。
$zh$
 where slug = 'wide-elbow-triceps-press-dumbbell';
update exercise_template
   set title_zh = $zh$宽握引体向上$zh$,
       how_to_zh = $zh$1. 向上伸手，用宽正握（掌心向前）握住引体向上杆。双手间距应大于肩宽但不要过宽。
2. 肩部后收，收紧腹部，双脚离地悬垂于空中。双脚并拢，或屈膝并交叉小腿。
3. 吸气，用流畅的动作将身体拉起。拉至下巴超过横杆，呼气时短暂保持。
4. 缓慢下放身体并吸气。
$zh$
 where slug = 'wide-pull-up';
update exercise_template
   set title_zh = $zh$卷腕器$zh$,
       how_to_zh = $zh$1. 握住卷腕器，在其上挂一片杠铃片。
2. 站直，双臂在身体前方抬起，掌心向下。
3. 肩部后收，收紧腹部。
4. 吸气，开始将铃片卷起。
5. 铃片到达手部后，向相反方向旋转，将重量放回地面。
6. 保持平稳呼吸，尽可能坚持旋转。
$zh$
 where slug = 'wrist-roller';
update exercise_template
   set title_zh = $zh$瑜伽$zh$,
       how_to_zh = $zh$（Hevy 未提供此动作的分步说明。）$zh$
 where slug = 'yoga';
update exercise_template
   set title_zh = $zh$泽奇深蹲$zh$,
       how_to_zh = $zh$1. 将杠铃置于大约肚脐的高度。
2. 走近杠铃，将肘窝抵住杠铃。
3. 屈臂形成托架，将杠铃抵在腹部。
4. 向后退几步，挺胸，深吸气至腹部。
5. 想象坐在一把看不见的椅子上完成深蹲。保持脚跟贴地，躯干直立。
6. 在舒适的范围内尽量下蹲，然后脚跟发力回到顶端。呼气。
$zh$
 where slug = 'zercher-squat';
update exercise_template
   set title_zh = $zh$哑铃佐特曼弯举$zh$,
       how_to_zh = $zh$1. 双手各持一只哑铃站直，手臂自然垂于身体两侧。
2. 哑铃置于大腿前侧，掌心朝前。
3. 收紧腹部，吸气。
4. 弯举哑铃，直到手腕略高于肘部，呼气。
5. 到达最高点后，手腕旋转 180 度，掌心朝下将哑铃放回起始位置，下放过程吸气。
6. 再次旋转手腕，重复动作。$zh$
 where slug = 'zottman-curl-dumbbell';
-- ---------------------------------------------------------------------------
-- Normalisation: drop the trailing newline each dollar-quoted body acquired.
--
-- A dollar-quoted literal is written with the closing tag on its own line for
-- readability, which leaves one "\n" at the end of the value. Stored as is, that
-- renders as an extra blank line at the bottom of the instructions panel, so it
-- is trimmed once here rather than left to each renderer.
--
-- The character set matters: single-argument rtrim() strips SPACES only, which
-- is why the newline is named explicitly. Leading whitespace never exists —
-- every body starts immediately after the opening tag — so trimming both ends
-- is safe and costs nothing.
-- ---------------------------------------------------------------------------

update exercise_template
   set how_to_zh = btrim(how_to_zh, E'\n\r\t ')
 where how_to_zh is not null
   and how_to_zh <> btrim(how_to_zh, E'\n\r\t ');

-- ---------------------------------------------------------------------------
-- Guard: the translation must be complete.
--
-- Fails the migration rather than shipping a Chinese interface around English
-- movement names. The instruction check is separate from the title check because
-- the two can regress independently: a row can gain a title and still lose its
-- instructions, which is exactly the mistake this file was assembled to avoid.
-- ---------------------------------------------------------------------------

do $$
declare
  missing_titles integer;
  missing_instructions integer;
begin
  select count(*) into missing_titles
    from exercise_template
   where is_custom = false
     and (title_zh is null or btrim(title_zh) = '');

  if missing_titles > 0 then
    raise exception
      '0017 is incomplete: % catalog exercises have no Chinese title', missing_titles;
  end if;

  select count(*) into missing_instructions
    from exercise_template
   where is_custom = false
     and how_to is not null
     and how_to_zh is null;

  if missing_instructions > 0 then
    raise exception
      '0017 is incomplete: % catalog exercises keep English instructions', missing_instructions;
  end if;
end
$$;

commit;
