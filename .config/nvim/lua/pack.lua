---@class PackSpec
---@field src string | (string|vim.pack.Spec)[]
---@field before? function
---@field after? function
---@field sync? boolean
---@field on_pack_changed? function

local M = {}
local queue = {}

local function call_or_skip(f)
	if type(f) == "function" then
		local ok, err = pcall(f)
		if not ok then
			vim.notify_once(err, vim.log.levels.WARN)
		end
	end
end

local function as_list(v)
	return type(v) == "string" and { v } or v
end

local pack_changed_group = vim.api.nvim_create_augroup("PackChanged", { clear = false })
--- @param spec PackSpec
local function load_spec(spec)
	if type(spec.on_pack_changed) == "function" then
		vim.api.nvim_create_autocmd("PackChanged", {
			group = pack_changed_group,
			callback = function(args)
				spec.on_pack_changed({
					name = args.data.spec.name,
					kind = args.data.kind,
					path = args.data.path,
				})
			end,
		})
	end
	call_or_skip(spec.before)
	vim.pack.add(spec.src)
	call_or_skip(spec.after)
end

--- Add a new item to the collection
--- @param spec_list PackSpec[]
function M.add(spec_list)
	for _, spec in ipairs(spec_list) do
		spec.src = as_list(spec.src)
		-- sync or past VimEnter → load immediately, else defer to VimEnter
		if spec.sync or vim.v.vim_did_enter == 1 then
			load_spec(spec)
		else
			table.insert(queue, spec)
		end
	end
end

function M.create_autocmd()
	Jili.autocmd("VimEnter", {
		callback = function()
			local q = queue
			queue = {}
			vim.schedule(function()
				for _, spec in ipairs(q) do
					load_spec(spec)
				end
			end)
		end,
	})
end

return M
