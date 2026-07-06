local M = {}
local queue = {}
local timer = nil

---@param f function
function safe_call(f)
	local ok, err = pcall(f)
	if not ok then
		vim.notify(err, vim.log.levels.DEBUG)
	end
end

function flush_one()
	local task = table.remove(queue, 1)
	if not timer then
		return
	end
	if task == nil then
		timer:stop()
		timer:close()
		timer = nil
		return
	end
	safe_call(task)
	timer:start(1, 0, vim.schedule_wrap(flush_one))
end

function M.later(callback)
	table.insert(queue, callback)
	if timer == nil then
		timer = assert(vim.uv.new_timer())
		timer:start(1, 0, vim.schedule_wrap(flush_one))
	end
end

function M.now(callback)
	safe_call(callback)
end

return M
