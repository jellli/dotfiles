---@class PackSpec
---@field src string | (string|vim.pack.Spec)[]
---@field id? string
---@field before? function
---@field after? function
---@field sync? boolean
---@field on_pack_changed? function
---@field event? vim.api.keyset.events|vim.api.keyset.events[]
---@field cmd? string|string[]

---@class Loader
---@field try_load function
---@field on_cleanup function

local M = {}
local H = {}

local load_pack_group = vim.api.nvim_create_augroup("LoadPack", { clear = false })
local pack_changed_group = vim.api.nvim_create_augroup("PackChanged", { clear = false })
H.queue = {}
H.loaders = {}

function H.call_or_skip(f)
	if type(f) == "function" then
		local ok, err = pcall(f)
		if not ok then
			vim.notify_once(err, vim.log.levels.WARN)
		end
	end
end

function H.as_list(v)
	return type(v) == "string" and { v } or v
end

---@param spec PackSpec
function H.make_loader(spec)
	local loaded = false
	local cleanups = {}
	return {
		try_load = function()
			if loaded then
				return
			end
			loaded = true
			H.loaders[spec] = nil
			for _, fn in ipairs(cleanups) do
				fn()
			end
			cleanups = {}
			H.load_spec(spec)
		end,
		on_cleanup = function(fn)
			cleanups[#cleanups + 1] = fn
		end,
	}
end

---@param spec PackSpec
---@param loader Loader
function H.register_event(spec, loader)
	if not spec.event then
		return
	end
	local au_id = vim.api.nvim_create_autocmd(spec.event, {
		group = load_pack_group,
		once = true,
		callback = loader.try_load,
	})
	loader.on_cleanup(function()
		pcall(vim.api.nvim_del_autocmd, au_id)
	end)
end

---@param spec PackSpec
---@param loader Loader
function H.register_cmd(spec, loader)
	if not spec.cmd then
		return
	end
	for _, c in ipairs(H.as_list(spec.cmd)) do
		vim.api.nvim_create_user_command(c, function(args)
			loader.try_load()
			vim.api.nvim_cmd({ cmd = c, args = args.fargs, bang = args.bang }, {})
		end, { nargs = "*", bang = true })
		loader.on_cleanup(function()
			pcall(vim.api.nvim_del_user_command, c)
		end)
	end
end

---@param spec PackSpec
function H.register_pack_changed(spec)
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
end

--- @param spec PackSpec
function H.load_spec(spec)
	H.call_or_skip(spec.before)
	H.register_pack_changed(spec)
	vim.pack.add(spec.src)
	H.call_or_skip(spec.after)
end

--- Add a new item to the collection
--- @param spec_list PackSpec[]
function M.add(spec_list)
	for _, spec in ipairs(spec_list) do
		spec.src = H.as_list(spec.src)
		-- sync or past VimEnter → load immediately, else defer to VimEnter
		if spec.sync or vim.v.vim_did_enter == 1 then
			H.load_spec(spec)
		elseif spec.event or spec.cmd then
			local loader = H.make_loader(spec)
			H.loaders[spec.id or spec] = loader
			H.register_event(spec, loader)
			H.register_cmd(spec, loader)
		else
			table.insert(H.queue, spec)
		end
	end
end

--- @param spec_or_id PackSpec | string
--- @return Loader
function M.get_loader(spec_or_id)
	local key = type(spec_or_id) == "string" and spec_or_id or spec_or_id
	return H.loaders[key]
end

function M.create_autocmd()
	Jili.autocmd("VimEnter", {
		once = true,
		callback = function()
			local q = H.queue
			H.queue = {}
			vim.schedule(function()
				for _, spec in ipairs(q) do
					H.load_spec(spec)
				end
			end)
		end,
	})
end

return M
